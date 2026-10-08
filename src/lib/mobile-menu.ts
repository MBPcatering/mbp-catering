export function getMobileMenuLabel(isOpen: boolean) {
  return isOpen ? "Fermer le menu" : "Ouvrir le menu";
}

export function getMobileMenuClassName(isOpen: boolean) {
  return `mobile-menu${isOpen ? " is-open" : ""}`;
}
