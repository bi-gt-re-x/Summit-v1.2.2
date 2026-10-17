"""Sign-up: password rules, one account per inbox, the live email check, and
the confirmation email."""
from backend.database import connection as db
from backend.tracking import auth

GOOD = 'Summit-pass-9'


def _signup(client, email, password=GOOD, name='New Person'):
    return client.post('/api/auth/signup',
                       json={'name': name, 'email': email, 'password': password}).json()


def test_every_rule_is_listed_when_missing():
    assert auth.password_problem(GOOD) is None
    problem = auth.password_problem('abc')
    for label in ('at least 8 characters', 'an uppercase letter', 'a number', 'a symbol'):
        assert label in problem
    assert 'lowercase' not in problem
    assert auth.password_problem('A' * 200 + 'a1!')


def test_a_weak_password_is_refused_with_what_it_still_needs(anon):
    body = _signup(anon, 'weak@example.test', password='password1')
    assert not body['success'] and body['field'] == 'password'
    assert 'uppercase' in body['message'] and 'symbol' in body['message']


def test_the_old_signup_checks_passwords_too(anon):
    body = anon.post('/api/signup', json={'username': 'oldway', 'password': 'short'}).json()
    assert not body['success']


def test_same_inbox_spellings_match():
    assert auth.inbox_key('J.Overdam+summit@Gmail.com') == 'joverdam@gmail.com'
    assert auth.inbox_key('j.overdam@googlemail.com') == 'joverdam@gmail.com'
    assert auth.inbox_key('first.last+x@example.test') == 'first.last@example.test'
    assert auth.inbox_key('first.last@example.test') != auth.inbox_key('firstlast@example.test')


def test_an_email_already_in_use_cannot_make_a_second_account(anon):
    assert _signup(anon, 'Taken.Person@gmail.com')['success']
    for again in ('taken.person@gmail.com', 'TAKENPERSON@gmail.com',
                  'taken.person+two@gmail.com', 'takenperson@googlemail.com'):
        body = _signup(anon, again)
        assert not body['success'] and body['field'] == 'email', again
    count = sum(1 for user in db.users()
                if auth.inbox_key(user.get('email')) == 'takenperson@gmail.com')
    assert count == 1


def test_the_email_check_says_whether_an_address_is_free(anon):
    _signup(anon, 'checked@example.test')
    taken = anon.post('/api/auth/email_check', json={'email': 'Checked+a@example.test'}).json()
    assert taken['success'] and taken['valid'] and not taken['available']
    free = anon.post('/api/auth/email_check', json={'email': 'nobody@example.test'}).json()
    assert free['valid'] and free['available']
    assert not anon.post('/api/auth/email_check', json={'email': 'nope'}).json()['valid']


def test_the_confirmation_email_has_a_button_and_the_plain_link(monkeypatch):
    sent = {}

    def fake_send(to, subject, body, html=None):
        sent.update(to=to, subject=subject, body=body, html=html)
        return True

    monkeypatch.setattr(auth, '_send_mail', fake_send)
    user = {'email': 'a@example.test', 'name': 'Ada <b>', 'verify_token': 'tok123'}
    ok, link = auth.send_verification(user)
    assert ok and link.endswith('/verify/tok123')
    assert link in sent['body'] and 'e-mail' not in sent['body']
    assert 'Confirm my email' in sent['html'] and link in sent['html']
    assert '<b>' not in sent['html']
