"""The rules the browser and the server both apply — read from one file.

shared/rules.json holds every value both sides need: the XP range and bands,
the grade bands, what counts as time spent, the reasons a task went the way it
did, the shape of a recommendation and of a space page. The browser imports
the same file ('@shared/rules.json'). Before it existed each value was typed
twice with a comment saying "mirrors" the other copy, and the copies drifted —
the reasons' labels already had.

So no module copies a value out of it by hand: they read `RULES` here.
"""
import json
import os

PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
                    'shared', 'rules.json')

with open(PATH, encoding='utf-8') as handle:
    RULES = json.load(handle)
