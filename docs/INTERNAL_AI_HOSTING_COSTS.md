# Internal: AI + hosting costs (LeadLab)

**Not linked from product UI.** Research note for operators only.

## AI for rewrite + branded HTML email

LeadLab needs short rewrite + branded HTML (optional images). **Gemini Flash via API is the best fit** — already wired in `backend/app/services/free_ai_service.py` (`GEMINI_API_KEY`, `GEMINI_HTML_MODEL`).

| Provider | Shape | Approx cost | Fit |
|---|---|---|---|
| **Google Gemini** | Free tier Flash; paid Flash ~$0.75 / $3.75 per 1M in/out (intro through end-2026 on 3.8 Flash); 2.5 Flash-Lite lower | Pennies per email (~2–8k tokens HTML) | **Preferred** — multimodal, already integrated |
| **OpenAI** | GPT-4o-mini / 4.1-mini class | Still cheap; typically a bit above Flash Lite | Easy API; more setup than reusing Gemini |
| **Anthropic Claude** | Haiku / Sonnet | Haiku cheap; Sonnet costlier for long HTML | Strong quality; higher cost at volume |
| **Manus** | Free 300 credits/day; Pro ~$20/mo (4k) → ~$200/mo (40k) | Credits burn on agent tasks (VM + LLM), not $/email | **Wrong tool** for in-app generate-html; OK as a human research agent outside the CRM |

**When turning AI on for real:** stay on Gemini Flash; enable Google billing only if free-tier rate limits bite. Do **not** integrate Manus into Cold Outreach.

Rough math: ~1,000 branded generates/month ≈ low dollars on Flash — **not** the cost driver. Hosting cold starts hurt UX more than AI today.

## Hosting / “always loading”

Root cause of perpetual spinners is largely **Render free plan spin-down** (cold API + DB wake), plus UI gates (PrivateRoute waiting on `fetchUser`, dashboard waiting on both stats queries). Buying a large plan **only for RAM** is usually wrong.

| Option | Approx | Notes |
|---|---|---|
| **Render Starter web** | **~$7/mo** (512 MB) | Kills cold start; **recommended first upgrade** |
| Render Standard | **~$25/mo** (2 GB) | Only if OOM / CPU after Starter |
| Fly.io 512 MB–1 GB | **~$3–7/mo** compute | Cheaper compute; managed Postgres often more expensive |
| DigitalOcean App 512 MiB | **~$5/mo** | Cheap + predictable |
| Railway | usage (~$7–15 est.) | Cheap if quiet; bill swings |
| Hetzner / DO Droplet | **~$4–12/mo** | Cheapest raw VM; more ops |

**Recommendation:** upgrade free → **Starter ($7)** for always-on. Move to 2 GB ($25) only after metrics show memory pressure. Alternatives (Fly / DO App ~$5–7) if you accept migration cost.

Code mitigations already shipped: PrivateRoute ~12s timeout + Retry/Sign out; dashboard paints shell without blocking on both queries; dashboard `/stats` caches table introspection.
