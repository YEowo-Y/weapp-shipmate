# Provider brand assets

Eight static brand SVGs are vendored from [Lobe Icons](https://github.com/lobehub/lobe-icons), an open-source AI brand icon collection. The former `lobehub/icons` URL redirects to this repository. These are upstream assets, not locally drawn approximations.

- Retrieved: 2026-10-16; DeepSeek, Zhipu and Kimi added 2026-10-25 from the same pinned commit.
- Pinned upstream commit: [`8a1b2821bb768c484fe8da20c5e1838b6bf551a9`](https://github.com/lobehub/lobe-icons/tree/8a1b2821bb768c484fe8da20c5e1838b6bf551a9).
- License: MIT, copyright 2023 LobeHub. The complete, unmodified upstream license is retained in [LICENSE](./LICENSE).
- Files are byte-for-byte upstream copies. No package installation, runtime CDN, or asset transformation is required.
- [manifest.json](./manifest.json) records immutable raw URLs, byte counts, rendering modes, and SHA-256 hashes for all SVGs and the license.

| Provider | Local asset | Immutable upstream source | Rendering |
| --- | --- | --- | --- |
| OpenAI | `openai.svg` | [SVG](https://github.com/lobehub/lobe-icons/blob/8a1b2821bb768c484fe8da20c5e1838b6bf551a9/packages/static-svg/icons/openai.svg) | Monochrome; use a CSS mask with `background-color: currentColor` for light/dark themes. |
| Anthropic | `anthropic.svg` | [SVG](https://github.com/lobehub/lobe-icons/blob/8a1b2821bb768c484fe8da20c5e1838b6bf551a9/packages/static-svg/icons/anthropic.svg) | Upstream Anthropic provider monogram, not the Claude model symbol; monochrome CSS mask. |
| Google | `google-color.svg` | [SVG](https://github.com/lobehub/lobe-icons/blob/8a1b2821bb768c484fe8da20c5e1838b6bf551a9/packages/static-svg/icons/google-color.svg) | Preserve the original four colors in an `img`; do not mask or invert. Google identifies the provider; Gemini identifies its model family. |
| Ollama | `ollama.svg` | [SVG](https://github.com/lobehub/lobe-icons/blob/8a1b2821bb768c484fe8da20c5e1838b6bf551a9/packages/static-svg/icons/ollama.svg) | Monochrome CSS mask. |

| OpenRouter | `openrouter.svg` | [SVG](https://github.com/lobehub/lobe-icons/blob/8a1b2821bb768c484fe8da20c5e1838b6bf551a9/packages/static-svg/icons/openrouter.svg) | Monochrome CSS mask. |
| DeepSeek | `deepseek.svg` | [SVG](https://github.com/lobehub/lobe-icons/blob/8a1b2821bb768c484fe8da20c5e1838b6bf551a9/packages/static-svg/icons/deepseek.svg) | Monochrome CSS mask. |
| GLM / Zhipu | `zhipu.svg` | [SVG](https://github.com/lobehub/lobe-icons/blob/8a1b2821bb768c484fe8da20c5e1838b6bf551a9/packages/static-svg/icons/zhipu.svg) | Monochrome CSS mask. |
| Kimi | `kimi.svg` | [SVG](https://github.com/lobehub/lobe-icons/blob/8a1b2821bb768c484fe8da20c5e1838b6bf551a9/packages/static-svg/icons/kimi.svg) | Monochrome CSS mask. |

All eight SVGs have a `0 0 24 24` viewBox. Keep their aspect ratio, use a consistent icon box, and let nearby provider text supply the accessible name (`aria-hidden="true"` for decorative masks; `alt=""` for a decorative image). The source paths are not altered for optical alignment.

## Import verification

Each downloaded SVG was parsed as XML before being written. Checks rejected DTD/entity declarations, non-passive elements (including script, foreignObject, image, use and animation), event-handler attributes, href/src attributes, JavaScript/data/HTTP attribute values, CSS imports/expressions, and non-local `url()` references. Only passive SVG geometry, definitions, gradients, clipping, and title elements were allowed. All eight assets passed, and each has a valid viewBox. The stored hashes were recomputed after writing.

The package license is retained alongside the artwork. Provider names and marks remain the property of their respective owners; this UI uses them to identify model services.
