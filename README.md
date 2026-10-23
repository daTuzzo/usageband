# usageband

Your Claude Code usage at a glance: what is left of the 5-hour and 7-day limits, whether the prompt cache is warm, what the next message costs, and what the session has spent.

![usageband with the details menu open](docs/usageband.png)

## What it shows

**Footer line.** Always on, next to the model name, and it takes no space:

```
usageband 5h 77% │ 7d 96% │ $3.42   [collapse] warm 42m
```

The status part shows the 5-hour and 7-day limits left and the money spent this session. After the button, the cache shows its countdown in red while warm and its idle time in blue once cold.

**Band.** Six chips above the prompt. They reflow into rows as the pane narrows.

| Chip | Shows |
|---|---|
| 5H | Share of the 5-hour limit left, and the time to its reset |
| 7D | Share of the 7-day limit left, with LOW under 15% |
| Cache | Minutes left while warm (red), idle time once cold (blue) |
| Spent | What the session has cost so far |
| Tokens | Every token the session has processed |
| Next | What one more message costs now on your model |

![The band in a narrow pane, warm and cold](docs/narrow.png)

**Details menu.** Opens upward from the band, so the band and the prompt stay where they are.

- Next-message price on each model: Fable, Opus, Sonnet, Haiku
- Tokens: sent, new (not from the cache), cache read, cache write, out
- Prompt count, reset times, tokens in the cache
- Subagents by cost, with paging when there are many
- Keep warm: a timer that keeps the prompt cache warm while you are away (see below)
- An optional pixel mascot for the cache chip, off by default

## Controls

| Control | Where | Does |
|---|---|---|
| expand / collapse | Footer | Shows or hides the band |
| ▴ / ▾ | Band | Opens or closes the details menu |
| ━ | Band | Hides the band |
| keep warm | Details header | Steps the keep-warm timer: off, 2 h, 4 h, 8 h, off |
| mascot on/off | Details header | Shows or hides the mascot |
| `/band` | Prompt | Shows or hides the band |

## Keep warm

A cold cache makes the next message re-write the whole context at twice the input price. A warm one only reads it. On Opus, one cold send costs as much as about 40 reads, so keeping the cache warm while you step away is cheap next to coming back to a cold one.

Press **keep warm** in the details header to start a timer (2 h, 4 h or 8 h). Until it runs out, the mod sends one short line ("reply with only the word ok") 59 minutes after the last request, just before the 1-hour cache expires. The footer shows `kw` while it runs, and the button counts down.

It stops on its own, and shows why, when:

- the timer runs out;
- the pings have cost half of one cold send (so the worst case loses half of one);
- a cold send would cost under $1 (small contexts are not worth keeping);
- the 5-hour limit has under 10% left or the 7-day limit under 5%;
- a ping wrote the cache instead of reading it (the cache had already expired, or the session is on the 5-minute cache of usage overage).

It never pings while a turn is running, and pings do not count as your prompts. Check the logic: `npx -y tsx tests/keepwarm.check.ts`.

## Install

In Claude Code:

```
/plugin marketplace add daTuzzo/usageband
/plugin install usageband@usageband
```

Then start a new session.

## Notes

- Prices are Anthropic API list prices per million tokens. A subscription bills differently, so read the dollar figures as what the same work would cost on the API.
- The cache counts as warm for 60 minutes after the last request, the lifetime of the cache Claude Code uses.
- "New" input is small by design: Claude Code serves almost the whole prompt from the cache on every request.
- Subagent costs are priced from each subagent's own token counts. The session total is the engine's own figure.
- The drawn band needs the desktop app. The terminal gets a text version of the same figures.

## License

[MIT](LICENSE)
