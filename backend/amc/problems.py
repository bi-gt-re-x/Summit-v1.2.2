"""Every problem the site can serve: the original bank plus imported official
problems and the AI-written ones (backend/amc/create.py). Everything that looks
a problem up goes through here, so an official or AI problem can be answered, reviewed, searched and sat in a timed contest exactly
like a bank one.
"""
from backend.amc import bank, create, official


def all_problems():
    return bank.PROBLEMS + official.all_problems() + create.all_problems()


def get(pid):
    return bank.BY_ID.get(pid) or official.get(pid) or create.get(pid)


def by_id():
    return {p['id']: p for p in all_problems()}
