export function loadSourceUrls(): string[] {
  return Object.values(
    import.meta.glob('/src/sources/*.png', {
      eager: true,
      query: '?url',
      import: 'default',
    }) as Record<string, string>,
  );
}
