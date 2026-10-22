import { IconChevronLeft } from "../icons.tsx";

export function Back() {
  return (
    <a className="back" data-direction="back" href="/">
      <IconChevronLeft size={16} />
      <span>Назад</span>
    </a>
  );
}
