/** The solid-fill form of an accent colour: 'var(--green)' becomes 'var(--green-fill)'.
 *  The plain tokens turn into deeper text shades in light theme (theme.css); bars, segments and
 *  other solid shapes keep the bright shade in both themes. Anything else is returned as is. */
export function fillColor(color: string): string {
  return color.replace(/var\(--(green|yellow|orange|teal|red|blue|purple|pink)\)/g, 'var(--$1-fill)');
}
