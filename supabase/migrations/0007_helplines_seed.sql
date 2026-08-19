-- Seeds only the two numbers confirmed as India's standing national
-- emergency lines (design-plan.md Milestone 9). `traffic` and
-- `bmc_control_room` are deliberately left empty: independent web sources
-- disagreed with each other on Mumbai/BMC-specific numbers (some conflicting
-- even across official-looking .gov.in pages), so seeding one here risked
-- publishing a wrong emergency contact. Add those — and any area-specific
-- rows — once someone on the team has confirmed the current numbers
-- against Mumbai Police / BMC directly; ideally the Ganeshotsav-specific
-- control room lines they publish each festival season, not just the
-- year-round ones.

insert into helplines (category, area, phone, notes) values
  ('police', null, '100', 'National police emergency number'),
  ('medical', null, '108', 'National ambulance / medical emergency number');
