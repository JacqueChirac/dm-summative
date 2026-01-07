import psycopg2
import pandas as pd
from scipy import stats
import matplotlib.pyplot as plt
import numpy as np
import os

CONNECTION_STRING = "postgresql://neondb_owner:npg_nDCY0KAWtN3z@ep-patient-night-a5t2b28c-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require"

# Demographic categories to analyze (for detailed scatter plots)
DEMO_CATEGORIES = {
    "2255": "Sales and service occupations",
    "2256": "Trades, transport and equipment operators",
    "2257": "Natural resources, agriculture",
    "2258": "Manufacturing and utilities"
}

# Output directory
OUTPUT_DIR = "output"


def load_cpc_votes(excel_file="../source/cpc_votes_by_election.xlsx"):
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


def fetch_all_demographic_categories():
    """
    Fetch all available demographic categories from database.
    Returns dict: {char_id: {"category": ..., "subcategory": ..., "subsubcategory": ..., "full_name": ...}}
    """
    conn = psycopg2.connect(CONNECTION_STRING)
    cur = conn.cursor()
    
    query = """
        SELECT DISTINCT 
            dc.characteristics_id,
            dc.category,
            dc.subcategory,
            dc.subsubcategory
        FROM demographic_categories dc
        JOIN demographics_geographic dg ON dc.id = dg.category_id
        WHERE dg.is_constituency = true
          AND dg.constituency_id IS NOT NULL
        ORDER BY dc.characteristics_id
    """
    
    cur.execute(query)
    rows = cur.fetchall()
    
    cur.close()
    conn.close()
    
    categories = {}
    for char_id, cat, subcat, subsubcat in rows:
        # Build full hierarchical name
        parts = [p for p in [cat, subcat, subsubcat] if p]
        full_name = " → ".join(parts) if parts else "Unknown"
        
        # Short name for charts (most specific level)
        short_name = subsubcat or subcat or cat or "Unknown"
        
        categories[char_id] = {
            "category": cat,
            "subcategory": subcat,
            "subsubcategory": subsubcat,
            "full_name": full_name,
            "short_name": short_name
        }
    
    print(f"✅ Found {len(categories)} demographic categories in database")
    return categories


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


def calculate_correlations(merged_df, demo_categories_dict):
    """Calculate Pearson correlations between CPC change and each demographic."""
    results = []
    
    for char_id, cat_info in demo_categories_dict.items():
        # Handle both old format (string) and new format (dict)
        if isinstance(cat_info, dict):
            short_name = cat_info.get("short_name", "Unknown")
            full_name = cat_info.get("full_name", "Unknown")
            category = cat_info.get("category", "")
            subcategory = cat_info.get("subcategory", "")
            subsubcategory = cat_info.get("subsubcategory", "")
        else:
            short_name = cat_info
            full_name = cat_info
            category = cat_info
            subcategory = ""
            subsubcategory = ""
        
        col_name = f"demo_{char_id}"
        
        if col_name not in merged_df.columns:
            continue
        
        # Drop rows with missing values for this comparison
        valid_data = merged_df[["cpc_change_21_25", col_name]].dropna()
        
        if len(valid_data) < 10:
            continue
        
        # Pearson correlation
        r, p_value = stats.pearsonr(valid_data[col_name], valid_data["cpc_change_21_25"])
        
        # Spearman correlation (more robust to outliers)
        rho, p_spearman = stats.spearmanr(valid_data[col_name], valid_data["cpc_change_21_25"])
        
        results.append({
            "characteristics_id": char_id,
            "category": category,
            "subcategory": subcategory,
            "subsubcategory": subsubcategory,
            "short_name": short_name,
            "full_name": full_name,
            "n": len(valid_data),
            "pearson_r": round(r, 4),
            "pearson_p": round(p_value, 6),
            "spearman_rho": round(rho, 4),
            "spearman_p": round(p_spearman, 6),
            "significant": p_value < 0.05
        })
    
    return pd.DataFrame(results)


def print_correlation_details(correlation_results):
    """Print detailed correlation results."""
    for _, row in correlation_results.iterrows():
        r = row["pearson_r"]
        p_value = row["pearson_p"]
        
        strength = "weak"
        if abs(r) >= 0.5:
            strength = "strong"
        elif abs(r) >= 0.3:
            strength = "moderate"
        
        direction = "positive" if r > 0 else "negative"
        sig_text = "statistically significant" if p_value < 0.05 else "NOT significant"
        
        print(f"\n📊 {row['category']} (ID: {row['characteristics_id']})")
        print(f"   Pearson r = {r:.4f} ({strength} {direction} correlation)")
        print(f"   p-value = {p_value:.6f} ({sig_text})")
        print(f"   n = {row['n']} constituencies")


def create_top_bottom_r_chart(correlation_results, output_file="output/top_bottom_correlations.png"):
    """Create horizontal bar chart showing top 10 and bottom 10 r scores."""
    os.makedirs(os.path.dirname(output_file), exist_ok=True)
    
    # Sort by r score
    sorted_results = correlation_results.sort_values("pearson_r", ascending=False)
    
    # Get top 10 (most positive) and bottom 10 (most negative)
    top_10 = sorted_results.head(10)
    bottom_10 = sorted_results.tail(10)
    
    # Combine and reverse bottom 10 so most negative is at top
    combined = pd.concat([top_10, bottom_10.iloc[::-1]])
    
    fig, ax = plt.subplots(figsize=(14, 12))
    
    # Create bar chart
    y_positions = range(len(combined))
    colors = ["#2ca02c" if r > 0 else "#d62728" for r in combined["pearson_r"]]
    
    bars = ax.barh(y_positions, combined["pearson_r"], color=colors, alpha=0.7, edgecolor="black")
    
    # Truncate long category names for readability
    labels = []
    for idx, row in combined.iterrows():
        # Use short_name if available, fallback to category
        label = row.get("short_name", row.get("category", "Unknown"))
        if len(label) > 50:
            label = label[:47] + "..."
        sig = "***" if row["pearson_p"] < 0.001 else ("**" if row["pearson_p"] < 0.01 else ("*" if row["pearson_p"] < 0.05 else ""))
        labels.append(f"{label} {sig}")
    
    ax.set_yticks(y_positions)
    ax.set_yticklabels(labels, fontsize=9)
    ax.set_xlabel("Pearson Correlation Coefficient (r)", fontsize=12, fontweight="bold")
    ax.set_title("Top 10 and Bottom 10 Correlations with CPC Vote Change (2021→2025)", 
                 fontsize=14, fontweight="bold", pad=20)
    
    # Add vertical line at x=0
    ax.axvline(x=0, color="black", linewidth=1.5, linestyle="-")
    
    # Add r values on bars
    for i, (bar, r_val) in enumerate(zip(bars, combined["pearson_r"])):
        x_pos = r_val + (0.01 if r_val > 0 else -0.01)
        ha = "left" if r_val > 0 else "right"
        ax.text(x_pos, i, f" {r_val:.3f}", va="center", ha=ha, fontsize=8, fontweight="bold")
    
    # Add legend for significance
    legend_text = "Significance: *** p<0.001, ** p<0.01, * p<0.05"
    ax.text(0.02, 0.98, legend_text, transform=ax.transAxes, 
            fontsize=9, verticalalignment="top", bbox=dict(boxstyle="round", facecolor="wheat", alpha=0.5))
    
    ax.grid(axis="x", alpha=0.3)
    plt.tight_layout()
    plt.savefig(output_file, dpi=150, bbox_inches="tight")
    print(f"\n✅ Saved top/bottom correlations chart to {output_file}")
    plt.close()


def create_scatter_plots(merged_df, output_file="output/correlation_plots.png"):
    """Create scatter plots with regression lines for each demographic."""
    os.makedirs(os.path.dirname(output_file), exist_ok=True)
    
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
    plt.close()


def create_individual_scatter_plots(merged_df, correlation_results, output_folder="output/top_correlations"):
    """
    Create individual scatter plots for top 10 and bottom 10 demographics by absolute r score.
    Saves each plot as a separate image file.
    """
    os.makedirs(output_folder, exist_ok=True)
    
    # Sort by absolute r score and get top 20 (10 highest + 10 lowest by absolute value)
    correlation_results = correlation_results.copy()
    correlation_results["abs_r"] = correlation_results["pearson_r"].abs()
    top_20_by_abs = correlation_results.nlargest(20, "abs_r")
    
    print(f"\n📊 Creating individual scatter plots for top 20 demographics (by |r|)...")
    
    for idx, row in top_20_by_abs.iterrows():
        char_id = row["characteristics_id"]
        label = row["category"]
        r_value = row["pearson_r"]
        p_value = row["pearson_p"]
        
        col_name = f"demo_{char_id}"
        
        if col_name not in merged_df.columns:
            print(f"   ⚠️ Skipping {char_id}: no data in merged dataframe")
            continue
        
        valid_data = merged_df[["cpc_change_21_25", col_name, "riding_name", "province"]].dropna()
        
        if len(valid_data) < 10:
            print(f"   ⚠️ Skipping {char_id}: insufficient data")
            continue
        
        x = valid_data[col_name]
        y = valid_data["cpc_change_21_25"]
        
        # Create figure
        fig, ax = plt.subplots(figsize=(10, 8))
        
        # Color based on correlation direction
        color = "#2ca02c" if r_value > 0 else "#d62728"
        
        # Scatter plot
        ax.scatter(x, y, alpha=0.5, color=color, s=40, edgecolors="black", linewidths=0.5)
        
        # Regression line
        slope, intercept, r, p, se = stats.linregress(x, y)
        x_line = np.linspace(x.min(), x.max(), 100)
        y_line = slope * x_line + intercept
        ax.plot(x_line, y_line, color="red", linewidth=2.5, 
                label=f"r = {r:.4f}, p = {p:.6f}")
        
        # Significance indicator
        sig = "***" if p_value < 0.001 else ("**" if p_value < 0.01 else ("*" if p_value < 0.05 else ""))
        
        # Truncate long labels for title
        title_label = label if len(label) <= 60 else label[:57] + "..."
        
        ax.set_xlabel(f"{title_label} Rate (%)", fontsize=11)
        ax.set_ylabel("CPC % Change (2021→2025)", fontsize=11)
        ax.set_title(f"{title_label}\n(ID: {char_id}) {sig}", fontsize=12, fontweight="bold")
        ax.legend(loc="best", fontsize=10)
        ax.grid(True, alpha=0.3)
        
        # Add zero line for reference
        ax.axhline(y=0, color="gray", linestyle="--", alpha=0.5)
        
        # Add correlation strength text
        strength = "weak"
        if abs(r_value) >= 0.5:
            strength = "strong"
        elif abs(r_value) >= 0.3:
            strength = "moderate"
        direction = "positive" if r_value > 0 else "negative"
        
        info_text = f"Correlation: {strength} {direction}\nn = {len(valid_data)} constituencies"
        ax.text(0.02, 0.98, info_text, transform=ax.transAxes, fontsize=9,
                verticalalignment="top", bbox=dict(boxstyle="round", facecolor="wheat", alpha=0.5))
        
        plt.tight_layout()
        
        # Create safe filename from characteristics_id and truncated label
        safe_label = "".join(c if c.isalnum() or c in " _-" else "_" for c in label[:30])
        filename = f"{char_id}_{safe_label}.png"
        filepath = os.path.join(output_folder, filename)
        
        plt.savefig(filepath, dpi=150, bbox_inches="tight")
        plt.close()
    
    print(f"✅ Saved {len(top_20_by_abs)} individual scatter plots to {output_folder}/")


def create_summary_table(correlation_results, output_file="output/correlation_summary.xlsx"):
    """Save correlation results to Excel."""
    os.makedirs(os.path.dirname(output_file), exist_ok=True)
    correlation_results.to_excel(output_file, index=False)
    print(f"✅ Saved correlation summary to {output_file}")


def main():
    print("=" * 60)
    print("CPC Vote Change vs Demographics Analysis")
    print("=" * 60)
    
    # Create output directory
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    # Step 1: Load CPC votes
    print("\n📥 Loading CPC vote data...")
    cpc_df = load_cpc_votes()
    
    # Step 2: Fetch ALL demographic categories
    print("\n📥 Fetching all demographic categories from database...")
    all_categories = fetch_all_demographic_categories()
    
    # Step 3: Fetch demographics for all categories
    print("\n📥 Fetching demographic data for all categories...")
    char_ids = list(all_categories.keys())
    demo_df = fetch_demographics(char_ids)
    
    # Step 4: Merge datasets
    print("\n🔗 Merging datasets...")
    merged_df = pd.merge(cpc_df, demo_df, on="constituency_id", how="inner")
    print(f"✅ Merged data: {len(merged_df)} constituencies with both CPC and demographic data")
    
    # Step 5: Calculate correlations for ALL demographics
    print("\n📈 Calculating correlations for all demographics...")
    print("-" * 60)
    all_correlation_results = calculate_correlations(merged_df, all_categories)
    print(f"✅ Calculated correlations for {len(all_correlation_results)} demographic categories")
    
    # Step 6: Create top/bottom r score visualization
    print("\n📊 Creating top 10 / bottom 10 r score chart...")
    create_top_bottom_r_chart(all_correlation_results)
    
    # Step 7: Calculate correlations for specific categories (original 4)
    print("\n📈 Calculating correlations for specific occupation categories...")
    print("-" * 60)
    specific_correlation_results = calculate_correlations(merged_df, DEMO_CATEGORIES)
    print_correlation_details(specific_correlation_results)
    
    # Step 8: Summary of all correlations
    print("\n" + "=" * 60)
    print("TOP 10 POSITIVE CORRELATIONS")
    print("=" * 60)
    top_10 = all_correlation_results.nlargest(10, "pearson_r")
    print(top_10[["category", "pearson_r", "pearson_p", "n"]].to_string(index=False))
    
    print("\n" + "=" * 60)
    print("TOP 10 NEGATIVE CORRELATIONS")
    print("=" * 60)
    bottom_10 = all_correlation_results.nsmallest(10, "pearson_r")
    print(bottom_10[["category", "pearson_r", "pearson_p", "n"]].to_string(index=False))
    
    # Step 9: Create scatter plots for original 4 categories
    print("\n📊 Creating scatter plots for occupation categories...")
    create_scatter_plots(merged_df)
    
    # Step 10: Create individual scatter plots for top 20 by absolute r score
    create_individual_scatter_plots(merged_df, all_correlation_results)
    
    # Step 11: Save results
    create_summary_table(all_correlation_results)
    
    # Save merged data for further analysis
    output_csv = os.path.join(OUTPUT_DIR, "merged_analysis_data.csv")
    merged_df.to_csv(output_csv, index=False)
    print(f"✅ Saved merged data to {output_csv}")
    
    return merged_df, all_correlation_results


if __name__ == "__main__":
    merged_df, results = main()

