"""S3 client for listing files in the Knowledge Base source bucket."""

import boto3

from .config import Settings, get_settings


class S3Client:
    """Client for S3 operations."""

    def __init__(self, settings: Settings | None = None):
        """Initialize the S3 client."""
        self._settings = settings or get_settings()
        self._client = boto3.client("s3", region_name=self._settings.aws_region)
        self._bucket = self._settings.s3_documents_bucket

    def list_files(self, prefix: str = "") -> list[dict]:
        """
        List files in the S3 bucket.

        Args:
            prefix: Optional prefix to filter files

        Returns:
            List of file info dicts with name, size, and last_modified
        """
        files = []
        paginator = self._client.get_paginator("list_objects_v2")

        for page in paginator.paginate(Bucket=self._bucket, Prefix=prefix):
            for obj in page.get("Contents", []):
                key = obj["Key"]
                # Skip directories (keys ending with /)
                if key.endswith("/"):
                    continue

                # Extract filename from key
                filename = key.split("/")[-1] if "/" in key else key

                files.append(
                    {
                        "name": filename,
                        "key": key,
                        "size": obj["Size"],
                        "last_modified": obj["LastModified"].isoformat(),
                    }
                )

        return files

    def list_file_names(self, prefix: str = "") -> list[str]:
        """
        List just the file names in the S3 bucket.

        Args:
            prefix: Optional prefix to filter files

        Returns:
            List of filenames
        """
        files = self.list_files(prefix)
        return [f["name"] for f in files]

    def get_file_bytes(self, filename: str) -> bytes:
        """
        Download a file from S3 and return its raw bytes.

        Args:
            filename: The S3 object key or filename to download

        Returns:
            Raw file bytes
        """
        response = self._client.get_object(Bucket=self._bucket, Key=filename)
        return response["Body"].read()

    def format_file_list_for_prompt(self, prefix: str = "") -> str:
        """
        Format the file list for injection into AI prompts.

        Args:
            prefix: Optional prefix to filter files

        Returns:
            Formatted string listing all files
        """
        files = self.list_files(prefix)
        if not files:
            return "No documents found in the knowledge base."

        lines = ["Available documents in the knowledge base:"]
        for f in sorted(files, key=lambda x: x["name"]):
            lines.append(f"  - {f['name']}")

        return "\n".join(lines)
