import psycopg2
import pandas as pd
from scipy import stats
import matplotlib.pyplot as plt
import numpy as np

CONNECTION_STRING = "postgresql://neondb_owner:npg_nDCY0KAWtN3z@ep-patient-night-a5t2b28c-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require"

# Demographic categories to analyze
DEMO_CATEGORIES = {
    "2255": "Sales and service occupations",
    "2256": "Trades, transport and equipment operators",
    "2257": "Natural resources, agriculture",
    "2258": "Manufacturing and utilities"
}


def load_cpc_votes(excel_file="cpc_votes_by_election.xlsx"):
    """Load CPC vote data from Excel file."""
    df = pd.read_excel(excel_file)
    
    # Rename columns for easier access
    df = df.rename(columns={
        "Constituency ID": "constituency_id",
        "Riding Name": "riding_name",
        "Province": "province",
        "CPC % Change (2021→2025)": "cpc_change_21_25",
        "CPC % Change (2019→2025)": "cpc_change_19_25",
        "CPC % 2021": "cpc_pct_2021",
        "CPC % 2025": "cpc_pct_2025"
    })
    
    # Keep only rows with valid change data
    df = df[df["cpc_change_21_25"].notna()]
    
    print(f"✅ Loaded {len(df)} constituencies from CPC votes file")
    return df


def fetch_demographics(characteristics_ids):
    """
    Fetch demographic data for specified characteristics IDs.
    Returns DataFrame with constituency_id and rate values for each category.
    """
    conn = psycopg2.connect(CONNECTION_STRING)
    cur = conn.cursor()
    
    query = """
        SELECT 
            dg.constituency_id,
            dc.characteristics_id,
            dg.values
        FROM demographics_geographic dg
        JOIN demographic_categories dc ON dg.category_id = dc.id
        WHERE dc.characteristics_id = ANY(%s)
          AND dg.is_constituency = true
          AND dg.constituency_id IS NOT NULL
        ORDER BY dg.constituency_id, dc.characteristics_id
    """
    
    cur.execute(query, (characteristics_ids,))
    rows = cur.fetchall()
    
    cur.close()
    conn.close()
    
    # Organize data: constituency_id -> {char_id: rateTotal}
    demo_data = {}
    for constituency_id, char_id, values in rows:
        if constituency_id not in demo_data:
            demo_data[constituency_id] = {"constituency_id": constituency_id}
        
        # Extract rateTotal from values JSONB
        rate = values.get("rateTotal", 0) if values else 0
        demo_data[constituency_id][f"demo_{char_id}"] = rate
    
    df = pd.DataFrame(list(demo_data.values()))
    print(f"✅ Loaded demographics for {len(df)} constituencies")
    return df


def calculate_correlations(merged_df):
    """Calculate Pearson correlations between CPC change and each demographic."""
    results = []
    
    for char_id, label in DEMO_CATEGORIES.items():
        col_name = f"demo_{char_id}"
        
        if col_name not in merged_df.columns:
            print(f"⚠️  Missing data for {char_id}: {label}")
            continue
        
        # Drop rows with missing values for this comparison
        valid_data = merged_df[["cpc_change_21_25", col_name]].dropna()
        
        if len(valid_data) < 10:
            print(f"⚠️  Insufficient data for {char_id}: {label}")
            continue
        
        # Pearson correlation
        r, p_value = stats.pearsonr(valid_data[col_name], valid_data["cpc_change_21_25"])
        
        # Spearman correlation (more robust to outliers)
        rho, p_spearman = stats.spearmanr(valid_data[col_name], valid_data["cpc_change_21_25"])
        
        results.append({
            "characteristics_id": char_id,
            "category": label,
            "n": len(valid_data),
            "pearson_r": round(r, 4),
            "pearson_p": round(p_value, 6),
            "spearman_rho": round(rho, 4),
            "spearman_p": round(p_spearman, 6),
            "significant": p_value < 0.05
        })
        
        # Interpretation
        strength = "weak"
        if abs(r) >= 0.5:
            strength = "strong"
        elif abs(r) >= 0.3:
            strength = "moderate"
        
        direction = "positive" if r > 0 else "negative"
        sig_text = "statistically significant" if p_value < 0.05 else "NOT significant"
        
        print(f"\n📊 {label} (ID: {char_id})")
        print(f"   Pearson r = {r:.4f} ({strength} {direction} correlation)")
        print(f"   p-value = {p_value:.6f} ({sig_text})")
        print(f"   n = {len(valid_data)} constituencies")
    
    return pd.DataFrame(results)


def create_scatter_plots(merged_df, output_file="correlation_plots.png"):
    """Create scatter plots with regression lines for each demographic."""
    fig, axes = plt.subplots(2, 2, figsize=(14, 12))
    axes = axes.flatten()
    
    colors = ["#1f77b4", "#ff7f0e", "#2ca02c", "#d62728"]
    
    for idx, (char_id, label) in enumerate(DEMO_CATEGORIES.items()):
        ax = axes[idx]
        col_name = f"demo_{char_id}"
        
        if col_name not in merged_df.columns:
            ax.text(0.5, 0.5, f"No data for\n{label}", ha="center", va="center")
            ax.set_title(label)
            continue
        
        valid_data = merged_df[["cpc_change_21_25", col_name, "riding_name", "province"]].dropna()
        
        x = valid_data[col_name]
        y = valid_data["cpc_change_21_25"]
        
        # Scatter plot
        ax.scatter(x, y, alpha=0.5, color=colors[idx], s=30)
        
        # Regression line
        slope, intercept, r, p, se = stats.linregress(x, y)
        x_line = np.linspace(x.min(), x.max(), 100)
        y_line = slope * x_line + intercept
        ax.plot(x_line, y_line, color="red", linewidth=2, 
                label=f"r = {r:.3f}, p = {p:.4f}")
        
        ax.set_xlabel(f"{label} Rate (%)", fontsize=10)
        ax.set_ylabel("CPC % Change (2021→2025)", fontsize=10)
        ax.set_title(f"{label}\n(ID: {char_id})", fontsize=11, fontweight="bold")
        ax.legend(loc="best", fontsize=9)
        ax.grid(True, alpha=0.3)
        
        # Add zero line for reference
        ax.axhline(y=0, color="gray", linestyle="--", alpha=0.5)
    
    plt.suptitle("CPC Vote Change (2021→2025) vs Occupation Demographics", 
                 fontsize=14, fontweight="bold", y=1.02)
    plt.tight_layout()
    plt.savefig(output_file, dpi=150, bbox_inches="tight")
    print(f"\n✅ Saved scatter plots to {output_file}")
    plt.show()


def create_summary_table(correlation_results, output_file="correlation_summary.xlsx"):
    """Save correlation results to Excel."""
    correlation_results.to_excel(output_file, index=False)
    print(f"✅ Saved correlation summary to {output_file}")


def main():
    print("=" * 60)
    print("CPC Vote Change vs Occupation Demographics Analysis")
    print("=" * 60)
    
    # Step 1: Load CPC votes
    print("\n📥 Loading CPC vote data...")
    cpc_df = load_cpc_votes()
    
    # Step 2: Fetch demographics
    print("\n📥 Fetching demographic data from database...")
    char_ids = list(DEMO_CATEGORIES.keys())
    demo_df = fetch_demographics(char_ids)
    
    # Step 3: Merge datasets
    print("\n🔗 Merging datasets...")
    merged_df = pd.merge(cpc_df, demo_df, on="constituency_id", how="inner")
    print(f"✅ Merged data: {len(merged_df)} constituencies with both CPC and demographic data")
    
    # Step 4: Calculate correlations
    print("\n📈 Calculating correlations...")
    print("-" * 60)
    correlation_results = calculate_correlations(merged_df)
    
    # Step 5: Summary
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(correlation_results.to_string(index=False))
    
    # Step 6: Create visualizations
    print("\n📊 Creating scatter plots...")
    create_scatter_plots(merged_df)
    
    # Step 7: Save results
    create_summary_table(correlation_results)
    
    # Save merged data for further analysis
    merged_df.to_csv("merged_analysis_data.csv", index=False)
    print("✅ Saved merged data to merged_analysis_data.csv")
    
    return merged_df, correlation_results


if __name__ == "__main__":
    merged_df, results = main()

