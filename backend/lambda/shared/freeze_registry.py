"""Registry of DynamoDB tables that are frozen alongside LinkedStandards.

Each FreezableTable entry describes a secondary table whose live records are
copied with a `{pk}#{year}` key during a freeze operation.  Adding a new table
to the freeze (e.g. a future Wizard table) is a one-line registry addition.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class FreezableTable:
    """Descriptor for a secondary table that participates in audit year freezes."""
    table_env_var: str   # Name of the Lambda env var holding the table name
    pk_field: str        # Primary key attribute name (e.g. "course_id", "id")
    response_count_key: str  # Key used for this table's count in the freeze response


FREEZE_REGISTRY: list[FreezableTable] = [
    FreezableTable(
        table_env_var="COURSES_TABLE",
        pk_field="course_id",
        response_count_key="courses_count",
    ),
    FreezableTable(
        table_env_var="GOALS_TABLE",
        pk_field="id",
        response_count_key="goals_count",
    ),
    FreezableTable(
        table_env_var="COMPETENCIES_TABLE",
        pk_field="id",
        response_count_key="competencies_count",
    ),
]
