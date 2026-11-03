export const emptyFilters = {
  minWidth: 0,
  minHeight: 0,
  types: [],
  keyword: "",
  rememberSize: false,
  rememberTypes: false,
  rememberKeyword: false,
};
export function toggleType(selected, type) {
  return type === "all"
    ? []
    : selected.includes(type)
      ? selected.filter((value) => value !== type)
      : [...selected, type];
}
export function matchesMedia(item, filter, dimensions) {
  if (filter.types.length && !filter.types.includes(item.type || item.format))
    return false;
  if (
    filter.keyword &&
    !item.name
      .toLocaleLowerCase()
      .includes(filter.keyword.trim().toLocaleLowerCase())
  )
    return false;
  if (filter.minWidth || filter.minHeight) {
    const size = dimensions?.get(item.thumbnail);
    if (
      !size ||
      !(size.width > 0 && size.height > 0) ||
      size.width < filter.minWidth ||
      size.height < filter.minHeight
    )
      return false;
  }
  return true;
}
