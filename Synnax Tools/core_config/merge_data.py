
import csv
import glob
import heapq
import os
import sys
import tempfile
from contextlib import ExitStack
from decimal import Decimal, InvalidOperation


def merge(directory, output_filename="combined.csv"):
    combined_path = os.path.join(directory, output_filename)

    files = sorted(
        path for path in glob.glob(os.path.join(directory, "*.csv"))
        if os.path.abspath(path) != os.path.abspath(combined_path)
    )

    if not files:
        raise ValueError(f"No input CSV files found in {directory!r}")

    with ExitStack() as stack:
        readers = []
        headers = []
        time_indices = []
        data_indices = []
        paths = []

        # Open and validate input files
        for path in files:
            reader = csv.reader(
                stack.enter_context(
                    open(path, "r", newline="", encoding="utf-8-sig")
                )
            )

            try:
                header = next(reader)
            except StopIteration:
                continue

            time_columns = [
                i for i, col in enumerate(header)
                if "time_chan" in col
            ]

            if len(time_columns) != 1:
                raise ValueError(
                    f"{path}: expected exactly one time_chan column, "
                    f"found {len(time_columns)}"
                )

            readers.append(reader)
            headers.append(header)
            time_indices.append(time_columns[0])
            data_indices.append([
                i for i in range(len(header))
                if i != time_columns[0]
            ])
            paths.append(path)

        if not readers:
            raise ValueError("All input CSV files are empty")

        # Construct combined header
        combined_header = ["time"]
        output_ranges = []

        for header, columns in zip(headers, data_indices):
            start = len(combined_header)
            combined_header.extend(header[i] for i in columns)
            output_ranges.append((start, len(combined_header)))

        heap = []
        previous_times = [None] * len(readers)

        def push_next(file_idx):
            reader = readers[file_idx]

            for row in reader:
                # Skip blank rows
                if not row or all(not value.strip() for value in row):
                    continue

                if len(row) != len(headers[file_idx]):
                    raise ValueError(
                        f"{paths[file_idx]} at line {reader.line_num}: "
                        f"expected {len(headers[file_idx])} columns, "
                        f"got {len(row)}"
                    )

                raw_time = row[time_indices[file_idx]].strip()

                try:
                    timestamp = Decimal(raw_time)
                except InvalidOperation as exc:
                    raise ValueError(
                        f"{paths[file_idx]} at line {reader.line_num}: "
                        f"invalid timestamp {raw_time!r}"
                    ) from exc

                if not timestamp.is_finite():
                    raise ValueError(
                        f"{paths[file_idx]} at line {reader.line_num}: "
                        f"non-finite timestamp {raw_time!r}"
                    )

                # Validate chronological order
                prev = previous_times[file_idx]
                if prev is not None and timestamp < prev:
                    raise ValueError(
                        f"{paths[file_idx]} at line {reader.line_num}: "
                        f"timestamps are not sorted "
                        f"({timestamp} follows {prev})"
                    )

                previous_times[file_idx] = timestamp
                heapq.heappush(heap, (timestamp, file_idx, row))
                return

        # Prime heap
        for file_idx in range(len(readers)):
            push_next(file_idx)

        tmp_path = None

        try:
            # Write to temporary file to protect existing output
            with tempfile.NamedTemporaryFile(
                mode="w",
                newline="",
                encoding="utf-8",
                dir=directory,
                prefix=".combined_",
                suffix=".tmp",
                delete=False
            ) as out:
                tmp_path = out.name
                writer = csv.writer(out)
                writer.writerow(combined_header)

                while heap:
                    timestamp = heap[0][0]
                    merged_rows = []
                    file_occurrences = [0] * len(readers)

                    # Process every row at this timestamp
                    while heap and heap[0][0] == timestamp:
                        _, file_idx, row = heapq.heappop(heap)

                        occurrence = file_occurrences[file_idx]
                        file_occurrences[file_idx] += 1

                        # Preserve repeated samples from one file
                        if occurrence == len(merged_rows):
                            new_row = [""] * len(combined_header)
                            new_row[0] = row[time_indices[file_idx]]
                            merged_rows.append(new_row)

                        start, end = output_ranges[file_idx]

                        merged_rows[occurrence][start:end] = [
                            row[i] for i in data_indices[file_idx]
                        ]

                        push_next(file_idx)

                    writer.writerows(merged_rows)

            # Replace output only after successful merge
            os.replace(tmp_path, combined_path)

        finally:
            if tmp_path is not None and os.path.exists(tmp_path):
                os.remove(tmp_path)

    print(f"Merged {len(readers)} files -> {combined_path}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python merge_data.py <directory>")
        sys.exit(1)

    merge(sys.argv[1])
