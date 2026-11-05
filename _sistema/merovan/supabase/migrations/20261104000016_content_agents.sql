-- Phase 4 of the agents: content and publishing work on the existing scripts, creatives and
-- calendar. Rows created by test runs without an AI key are marked "ejemplo" so they can be removed
-- (scripts.demo already exists: it is the demonstration part of a script).
alter table scripts add column ejemplo boolean not null default false;
alter table creatives add column ejemplo boolean not null default false;
alter table content_calendar add column ejemplo boolean not null default false;
alter table content_calendar add column caption text not null default '';
alter table content_calendar add column proposal_id uuid references agent_proposals(id) on delete set null;
create index content_calendar_proposal_idx on content_calendar(proposal_id);
create index content_calendar_creative_idx on content_calendar(creative_id);
