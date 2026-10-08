# Shared code for ARCPA Evidence Finder Lambdas

import json
from decimal import Decimal


class DecimalEncoder(json.JSONEncoder):
    """JSON encoder that handles Decimal types from DynamoDB."""

    def default(self, obj):
        if isinstance(obj, Decimal):
            # Convert to int if it's a whole number, otherwise float
            if obj % 1 == 0:
                return int(obj)
            return float(obj)
        return super().default(obj)


def json_dumps(obj) -> str:
    """Serialize object to JSON, handling Decimal types."""
    return json.dumps(obj, cls=DecimalEncoder)
