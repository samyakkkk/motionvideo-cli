---
name: motionvideo
description: Discover motion references, retrieve original prompts and prepare an attributed remix brief from MotionVideo.
---

Use list-categories to discover category IDs, then search-videos with keywords and filters.
Search matches every word against title, creator handle, prompt and content tags. Fewer keywords can broaden an empty result. The limit is at most 30; total can exceed shown.
Use get-video with a returned slug to retrieve full details. The same entry is available in the CLI as get <slug>.
Use browse-directory for tools or studios. The tools section also contains skills/resources as in the existing MCP; do not promise richer website filters.
Use catalog-overview for complete counts and sections.
Use remix-video to prepare a brief with an optional direction. Without a direction, ask for brand, copy, palette, duration and aspect ratio before building. If no original prompt exists, say so and use the video as a reference only.
Credit the creator and canonical video page whenever adapting a prompt. A brief does not render or edit video.
