---
name: business-context-gatherer
description: Interview the user to create or update context/business.md with business model, unit economics, goals, and strategic context. Use for client onboarding or business briefings.
---
Interview me relentlessly about every aspect of this business until we reach a shared understanding. Walk down each branch of the business aspect, resolving dependencies between decisions one-by-one. For each question, provide your recommended answer.

Ask the questions one at a time.

If a question can be answered by exploring the current files in the folder, explore the project instead.

The goal is to have a complete business.md file which will serve as the base of each future optimisation in the Google Ads account, website and business. 

When we are reading the final file we need to understand business goals, challenges, business to google ads relationship. The file has to be the context book of the account that links present, future and past together so we can make the best decisions.

This also means to have context about cross channel activities and business issues that can have a huge impact, primarly on the Google Ads account, but also on the other marketing aspects.

## Domain Rules (Non-Negotiable)

These rules override all other instructions during the interview:

1. **Never skip unit economics.** If the user cannot provide inputs, mark as `[Not provided — ask in follow-up]` and flag prominently in the Gaps section with Critical priority. Without margins, CLV, and CAC, no downstream skill can set meaningful targets.

2. **Goals must be specific and measurable.** Push for specific numbers. "Grow conversions" is not acceptable. "Grow monthly conversions from 100 to 150 by Q3" is acceptable. Apply the SMART framework (Specific, Measurable, Achievable, Relevant, Time-bound).

3. **Validate feasibility immediately.** If targets are mathematically impossible given the collected unit economics (e.g., target CPA below cost to deliver), flag IMMEDIATELY during the Goals phase. Do not wait for the Validation phase.

4. **Do not assume, ask.** The user's stated context overrides any data in CSV files or other context files. If there is a conflict between stated context and data, note it and ask the user which is correct.

5. **Flag gaps, do not skip.** Every unanswered question must appear in the Gaps section with a priority level. Never silently omit a question because the user did not answer it.


## Check for existing file.

Check if there is already a `context/business.md`. Read it and continue from there. 

There is a chance that the business.md only has template values, in that case just ignore the file. 

## UI rule

Don't use AskUserQuestion let the users type their answers into the chat.