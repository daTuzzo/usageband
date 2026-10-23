# usageband

Your Claude Code usage at a glance: what is left of the 5-hour and 7-day limits, whether the prompt cache is warm, what the next message costs, and what the session has spent.

![usageband with the details menu open](docs/usageband.png)

## What it shows

**Footer line.** Always on, next to the model name, and it takes no space:

```
5h 77% left │ 7d 96% left │ cache warm 42m │ spent $3.42  [collapse]
```

In narrow panes it drops words ("left", then "spent") so it never wraps.

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
- An optional pixel mascot for the cache chip, off by default

## Controls

| Control | Where | Does |
|---|---|---|
| expand / collapse | Footer | Shows or hides the band |
| ▴ / ▾ | Band | Opens or closes the details menu |
| ━ | Band | Hides the band |
| mascot on/off | Details header | Shows or hides the mascot |
| `/band` | Prompt | Shows or hides the band |

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
