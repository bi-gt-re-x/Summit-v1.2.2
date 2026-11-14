"""Posting AMC 10, AMC 12 and AIME problems and solutions by hand (backend/amc/posts.py).

Any signed-in account may post. Posts are shared by every account; only the
author, or an importer account (`temu`), may edit or delete one. A post that
cannot be saved comes back as `{"success": false, "message": ...}`.
"""
from typing import List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from backend.amc import posts
from backend.api.amc import can_import
from backend.api.guard import current_username
from backend.api.reply import fail, ok

router = APIRouter(tags=['amc-posts'])


def _may_edit(username, post):
    return post['author'] == username or can_import(username)


def _out(username, post):
    return {**post, 'can_edit': _may_edit(username, post)}


class PostBody(BaseModel):
    level: str
    title: str = ''
    statement: str = ''
    choices: Optional[List[str]] = None
    answer: str = ''
    solution: str = ''


class SplitBody(BaseModel):
    statement: str = ''


@router.get('/api/amc/posts')
def listing(level: str = '', username: str = Depends(current_username)):
    rows = posts.all_posts(level if level in posts.LEVELS else '')
    return ok(posts=[_out(username, p) for p in rows], levels=list(posts.LEVELS))


@router.get('/api/amc/posts/{post_id}')
def one(post_id: str, username: str = Depends(current_username)):
    post = posts.get(post_id)
    return ok(post=_out(username, post)) if post else fail('No such post.')


@router.post('/api/amc/posts/split')
def split(body: SplitBody, username: str = Depends(current_username)):
    """Pull the five choices out of a pasted AMC statement."""
    stem, choices = posts.split(body.statement)
    if not choices:
        return fail('No (A) to (E) choices found in the problem text.')
    return ok(statement=stem, choices=choices)


@router.post('/api/amc/posts')
def create(body: PostBody, username: str = Depends(current_username)):
    try:
        post = posts.clean(body.level, body.title, body.statement, body.choices, body.answer, body.solution)
    except posts.Invalid as exc:
        return fail(str(exc))
    return ok(post=_out(username, posts.create(username, post)))


@router.put('/api/amc/posts/{post_id}')
def edit(post_id: str, body: PostBody, username: str = Depends(current_username)):
    have = posts.get(post_id)
    if not have:
        return fail('No such post.')
    if not _may_edit(username, have):
        return fail('Only the person who posted this can change it.')
    try:
        post = posts.clean(body.level, body.title, body.statement, body.choices, body.answer, body.solution)
    except posts.Invalid as exc:
        return fail(str(exc))
    return ok(post=_out(username, posts.update(post_id, post)))


@router.delete('/api/amc/posts/{post_id}')
def remove(post_id: str, username: str = Depends(current_username)):
    have = posts.get(post_id)
    if not have:
        return fail('No such post.')
    if not _may_edit(username, have):
        return fail('Only the person who posted this can delete it.')
    posts.delete(post_id)
    return ok()
