import { createElement, type ReactElement } from "react";
import Link from "next/link";
import {
  getNavLinkAriaCurrent,
  getNavLinkClassNames,
  PRIMARY_NAV_LINKS,
} from "../lib/nav-ui-state";
import { cn } from "../lib/utils";

type AppNavLinksProps = {
  pathname: string;
};

export function AppNavLinks({ pathname }: AppNavLinksProps): ReactElement {
  return createElement(
    "div",
    { className: "app-nav__links" },
    PRIMARY_NAV_LINKS.map((link) =>
      createElement(
        Link,
        {
          key: link.href,
          href: link.href,
          "aria-current": getNavLinkAriaCurrent(pathname, link),
          className: cn(...getNavLinkClassNames(pathname, link)),
        },
        link.label,
      ),
    ),
  );
}
