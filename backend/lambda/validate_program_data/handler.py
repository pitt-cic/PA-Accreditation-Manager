"""Lambda handler that validates GoalsTable and CompetenciesTable are populated."""

import logging
import sys

sys.path.insert(0, "/var/task")

from shared.competencies_client import CompetenciesDBClient
from shared.goals_client import GoalsDBClient

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def _handler(event, _context):
    """
    Validates that program goals and competencies exist before processing syllabi.
    Raises an exception (causing Step Functions task failure) if either table is empty.
    Passes the event through unchanged on success so the next state receives the course list.
    """
    goals = GoalsDBClient().get_all_goals()
    competencies = CompetenciesDBClient().get_all_competencies()

    if not goals:
        raise ValueError("GoalsTable is empty — upload program goals before processing syllabi")
    if not competencies:
        raise ValueError("CompetenciesTable is empty — upload program competencies before processing syllabi")

    logger.info("Validation passed: %d goals, %d competencies", len(goals), len(competencies))
    return event

handler = _handler
