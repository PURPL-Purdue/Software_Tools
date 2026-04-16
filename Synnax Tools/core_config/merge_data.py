import csv
import heapq
import os
import glob
import sys


def merge(directory, output_filename="combined.csv"):
    combined_path = os.path.join(directory, output_filename)

    files = sorted(
        f for f in glob.glob(os.path.join(directory, "*.csv"))
        if os.path.basename(f) != output_filename
        and not os.path.basename(f).endswith("NI9205_1.csv")
    )

    handles = [open(f, "r", newline="") for f in files]
    readers = [csv.reader(fh) for fh in handles]

    # Read headers; identify which column is the time channel per file
    headers = [next(r) for r in readers]
    time_col_indices = [
        next(i for i, col in enumerate(h) if "time_chan" in col)
        for h in headers
    ]

    # Build combined header: shared 'time' column + all data columns from each file
    combined_header = ["time"]
    file_data_cols = []  # (t_idx, output_col_start, output_col_end) per file
    for h, t_idx in zip(headers, time_col_indices):
        data_cols = [col for i, col in enumerate(h) if i != t_idx]
        col_start = len(combined_header)
        combined_header.extend(data_cols)
        file_data_cols.append((t_idx, col_start, col_start + len(data_cols)))

    n_cols = len(combined_header)

    # Prime the heap with the first row from each file
    heap = []
    current_rows = [None] * len(readers)

    for i, reader in enumerate(readers):
        try:
            row = next(reader)
            t_idx = time_col_indices[i]
            heapq.heappush(heap, (float(row[t_idx]), i))
            current_rows[i] = row
        except StopIteration:
            pass

    with open(combined_path, "w", newline="") as out:
        writer = csv.writer(out)
        writer.writerow(combined_header)

        while heap:
            timestamp, file_idx = heapq.heappop(heap)
            row = current_rows[file_idx]
            t_idx, col_start, col_end = file_data_cols[file_idx]

            out_row = [""] * n_cols
            out_row[0] = row[t_idx]
            data_vals = [v for i, v in enumerate(row) if i != t_idx]
            out_row[col_start:col_end] = data_vals

            writer.writerow(out_row)

            try:
                next_row = next(readers[file_idx])
                current_rows[file_idx] = next_row
                heapq.heappush(heap, (float(next_row[t_idx]), file_idx))
            except StopIteration:
                pass

    for fh in handles:
        fh.close()

    print(f"Merged {len(files)} files -> {combined_path}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python merge_data.py <directory>")
        print("Example: python merge_data.py output_data/blow_up_the_GG_2026-04-10T22.18.0")
        sys.exit(1)

    merge(sys.argv[1])
