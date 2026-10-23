import type { SVGProps } from "react";
import {
  ArrowRightStartOnRectangleIcon,
  BellAlertIcon,
  BellIcon,
  ChevronLeftIcon,
  MagnifyingGlassIcon,
  MapPinIcon,
  MoonIcon,
  PlusIcon,
  SunIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { StarIcon as StarSolidIcon } from "@heroicons/react/24/solid";
import { StarIcon as StarOutlineIcon } from "@heroicons/react/24/outline";

export type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function withIconDefaults({ className, size = 24, ...rest }: IconProps): SVGProps<SVGSVGElement> {
  return {
    className: className ? `ui-icon ${className}` : "ui-icon",
    width: size,
    height: size,
    "aria-hidden": true,
    ...rest,
  };
}

/** Утро на профиле / «утром» на остановке */
export function IconSunrise(props: IconProps) {
  return <SunIcon {...withIconDefaults(props)} />;
}

export function IconMoon(props: IconProps) {
  return <MoonIcon {...withIconDefaults(props)} />;
}

export function IconBell(props: IconProps) {
  return <BellIcon {...withIconDefaults(props)} />;
}

export function IconBellRing(props: IconProps) {
  return <BellAlertIcon {...withIconDefaults(props)} />;
}

export function IconPlus(props: IconProps) {
  return <PlusIcon {...withIconDefaults(props)} />;
}

export function IconX(props: IconProps) {
  return <XMarkIcon {...withIconDefaults(props)} />;
}

export function IconStar(props: IconProps) {
  return <StarOutlineIcon {...withIconDefaults(props)} />;
}

export function IconStarFilled(props: IconProps) {
  return <StarSolidIcon {...withIconDefaults(props)} />;
}

export function IconChevronLeft(props: IconProps) {
  return <ChevronLeftIcon {...withIconDefaults(props)} />;
}

export function IconSearch(props: IconProps) {
  return <MagnifyingGlassIcon {...withIconDefaults(props)} />;
}

export function IconPin(props: IconProps) {
  return <MapPinIcon {...withIconDefaults(props)} />;
}

export function IconLogout(props: IconProps) {
  return <ArrowRightStartOnRectangleIcon {...withIconDefaults(props)} />;
}