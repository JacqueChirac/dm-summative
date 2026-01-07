import csv
import json
from pathlib import Path
import psycopg2

CONNECTION_STRING = "postgresql://neondb_owner:npg_nDCY0KAWtN3z@ep-patient-night-a5t2b28c-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require"


def filter_demographics_to_csv(
    characteristics_ids, table_name="demographics_geographic", output_file=None
):
    """
    Filter demographic tables by characteristics_id and export to CSV.

    Args:
        characteristics_ids: List of characteristics IDs to filter (as strings)
        table_name: Which table to query - one of:
            - "demographics_geographic" (default)
            - "demographic_categories"
            - "demographic_stats"
            - "demographic_importance"
        output_file: Output CSV filename (auto-generated if None)
    """
    if output_file is None:
        output_file = f"../source/filtered_{table_name}.csv"

    conn = psycopg2.connect(CONNECTION_STRING)
    cur = conn.cursor()

    # Query with IN clause for efficiency - select all columns
    query = f"""
        SELECT *
        FROM {table_name}
        WHERE characteristics_id = ANY(%s)
        ORDER BY characteristics_id, id
    """

    cur.execute(query, (characteristics_ids,))

    # Get column names from cursor description
    column_names = [desc[0] for desc in cur.description]
    rows = cur.fetchall()

    # Write to CSV
    with open(output_file, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(column_names)
        writer.writerows(rows)

    cur.close()
    conn.close()

    print(f"✅ Exported {len(rows)} rows from {table_name} to {output_file}")
    return rows


if __name__ == "__main__":
    # The three characteristics IDs you want (as strings since characteristics_id is TEXT)
    target_ids = ["2255", "2256", "2257"]

    # Filter from demographics_geographic (default)
    filter_demographics_to_csv(target_ids)

    # Optionally filter from other tables too:
    # filter_demographics_to_csv(target_ids, table_name="demographic_categories")
    # filter_demographics_to_csv(target_ids, table_name="demographic_stats")
    # filter_demographics_to_csv(target_ids, table_name="demographic_importance")
