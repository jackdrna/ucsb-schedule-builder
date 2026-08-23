## TO DO
1. Figure out color pallet for background and courses
2. Improve selected course card styling
3. Add searching functions to sidebar including:
    a. Favorited (add a star outline in top right of each card in the main page to "Favorite")
    b. By track — the tracks and sequences are now loaded (see the Degree progress
       panel); still need a sidebar filter showing only a chosen track's courses
    c. ~~By name~~ — done, search box on both pages
4. ~~Connect to school developer API to get exact and refreshable class data~~ — done
   without needing an API key. See backend/scripts/ucsb/README.md; re-runnable
   against the General Catalog, the ECE department grid and the Schedule of Classes.
5. ~~Add link to plat/course pages for cards~~ — done, each card links to its
   catalog.ucsb.edu entry

## NEXT UP (from the data work)
* ~~Check a plan against the EE track / CE sequence requirements~~ — done; the
  Degree progress panel audits both majors against the 2026-27 GEAR
* Draw prerequisite arrows between placed courses — `prerequisite_edges` exists for
  exactly this
* Model general education / writing / free electives so the unit total is meaningful;
  the degree audit currently covers major requirements only
* Sidebar filter by track, plus "add these to finish the track" suggestions
* Summer quarter: currently out of scope; UCSB Summer Sessions publishes separately
* Refresh reminders — the dataset pins the 2025-26 catalog, the 2026-27 ECE grid and
  the 2026-27 GEAR. Watch for a 2026-27 General Catalog (it would give CMPSC 41 real
  prerequisites and let its NEW_COURSES entry go), and the 2027-28 GEAR.
* Consider showing minimum-grade requirements more prominently; they are stored in
  `prereq_notes` but only surface in the course directory

## IDEAS
* Implement AI-generated schedules based on text prompts
* Social media aspect, see other peoples schedules, friend eachother
* Account creation
* Multiple drafts of schedules
* Admin level/advisor level permissions where you can view, comment, etc. on students schedules
* Alert/notification system for deadlines, openings etc.
