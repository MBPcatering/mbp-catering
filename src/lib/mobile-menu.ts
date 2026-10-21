export function getMobileMenuLabel(
  isOpen: boolean,
  labels: { close: string; open: string },
) {
  return isOpen ? labels.close : labels.open;
}

export function getMobileMenuClassName(isOpen: boolean) {
  return `mobile-menu${isOpen ? " is-open" : ""}`;
}
