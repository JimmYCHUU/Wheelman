// The Playbook's routes, under /api/playbook/: the business facts with their state, and an answer
// saved there; the lessons with where each came from, the edits proposed as lessons and those marked
// not a rule, and the owner's decision on a proposal. src/server.js's api() hands every
// /api/playbook/ request here first. (src/playbook.js is another thing: the sales playbook that
// compact requests read.)

import { playbookFacts, saveFact } from './factbook.js';
import { listLessons, lessonDetails, editDecisions } from './db.js';
import { editProposals, decideProposal } from './editrules.js';

/** Answers a /api/playbook/ request. True when it answered; false leaves it to the routes after it. */
export async function playbookApi(req, res, p, url, { send, readBody }) {
  if (p === '/api/playbook/facts') {
    if (req.method === 'GET') { send(res, 200, playbookFacts()); return true; }
    if (req.method === 'POST') {
      const body = (await readBody(req)) || {};
      const out = saveFact({ title: body.title, answer: body.answer, status: body.status, from: body.from });
      if (out.error) send(res, out.status, { error: out.error });
      else send(res, 200, { fact: out.fact });
      return true;
    }
    send(res, 405, { error: 'Not allowed' });
    return true;
  }
  if (p === '/api/playbook/lessons') {
    if (req.method !== 'GET') { send(res, 405, { error: 'Not allowed' }); return true; }
    // Not a rule: each proposal marked so, as it stood then, newest first.
    const notRules = [...editDecisions().values()].filter((d) => d.decision === 'rejected').map((d) => d.proposal);
    send(res, 200, { lessons: lessonDetails(listLessons()), proposals: editProposals(), notRules });
    return true;
  }
  if (p === '/api/playbook/proposals') {
    if (req.method !== 'POST') { send(res, 405, { error: 'Not allowed' }); return true; }
    const body = (await readBody(req)) || {};
    const out = decideProposal(String(body.key || ''), body.decision);
    if (out.error) send(res, out.status, { error: out.error });
    else send(res, 200, out.lesson ? { lesson: out.lesson } : {});
    return true;
  }
  return false;
}
