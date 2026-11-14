"use client";

import * as React from "react";
import {
  ArrowLeftRight,
  ArrowUp,
  Check,
  CircleHelp,
  CornerDownRight,
  Indent,
  Link2,
  Lock,
  MoreVertical,
  Outdent,
  Plus,
  ScanText,
  Split,
  Trash2,
  Unlink,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/cn";

/**
 * Overflow menu for one ingredient row on narrow screens. On a phone there is
 * no room for the desktop row's six icon buttons next to the fields, so every
 * row action — toggles, alternatives, structure, delete — lives here, with a
 * text label instead of an icon you have to guess. Toggle states stay visible
 * outside the menu in the row's summary line.
 */
export function IngredientRowMenu({
  isAlternative,
  isOptional,
  fixedAmount,
  isRange,
  amountDisabled,
  onToggleOptional,
  onToggleFixedAmount,
  onToggleRange,
  onToggleFreeText,
  onAddAlternative,
  onDemote,
  onPromote,
  onDetach,
  onReparse,
  onUseOriginalAsFreeText,
  onInsertAbove,
  onSplitAbove,
  onRemove,
  className,
}: {
  isAlternative: boolean;
  isOptional: boolean;
  fixedAmount: boolean;
  isRange: boolean;
  amountDisabled: boolean;
  onToggleOptional: () => void;
  onToggleFixedAmount: () => void;
  onToggleRange: () => void;
  onToggleFreeText?: () => void;
  onAddAlternative?: () => void;
  onDemote?: () => void;
  onPromote?: () => void;
  onDetach?: () => void;
  onReparse?: () => void;
  onUseOriginalAsFreeText?: () => void;
  onInsertAbove?: () => void;
  onSplitAbove?: () => void;
  onRemove: () => void;
  className?: string;
}) {
  const hasStructure =
    onAddAlternative || onDemote || onPromote || onDetach || onInsertAbove || onSplitAbove;
  const hasOriginal = onReparse || onUseOriginalAsFreeText;
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Weitere Aktionen für diese Zutat"
          className={cn(
            "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius)] text-[var(--color-muted-fg)] transition-colors hover:bg-[var(--color-muted)] hover:text-[var(--color-fg)] data-[state=open]:bg-[var(--color-muted)]",
            className,
          )}
        >
          <MoreVertical className="size-5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        collisionPadding={8}
        className="w-64 max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto"
      >
        <DropdownMenuLabel>Menge</DropdownMenuLabel>
        {!isAlternative ? (
          <ToggleItem
            checked={isOptional}
            onSelect={onToggleOptional}
            icon={<CircleHelp />}
            label="Optional"
            hint="Gedimmt, nicht auf der Einkaufsliste"
          />
        ) : null}
        <ToggleItem
          checked={fixedAmount}
          onSelect={onToggleFixedAmount}
          icon={<Lock />}
          label="Feste Menge"
          hint="Skaliert nicht mit den Portionen"
        />
        {!amountDisabled ? (
          <ToggleItem
            checked={isRange}
            onSelect={onToggleRange}
            icon={<ArrowLeftRight />}
            label="Mengenbereich (von–bis)"
          />
        ) : null}
        {onToggleFreeText ? (
          <ToggleItem
            checked={false}
            onSelect={onToggleFreeText}
            icon={<Link2 />}
            label="Als Freitext ohne Artikel"
            hint="Kommt nicht auf die Einkaufsliste"
          />
        ) : null}

        {hasStructure ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Anordnung</DropdownMenuLabel>
            {onAddAlternative ? (
              <MenuAction icon={<CornerDownRight />} label="Alternative hinzufügen" onSelect={onAddAlternative} />
            ) : null}
            {onDemote ? (
              <MenuAction icon={<Indent />} label="Als Alternative der Zutat darüber" onSelect={onDemote} />
            ) : null}
            {onPromote ? (
              <MenuAction icon={<ArrowUp />} label="Mit Hauptzutat tauschen" onSelect={onPromote} />
            ) : null}
            {onDetach ? (
              <MenuAction icon={<Outdent />} label="Zur eigenständigen Zutat machen" onSelect={onDetach} />
            ) : null}
            {onInsertAbove ? (
              <MenuAction icon={<Plus />} label="Leere Zutat darüber einfügen" onSelect={onInsertAbove} />
            ) : null}
            {onSplitAbove ? (
              <MenuAction
                icon={<Split className="rotate-90" />}
                label="Neuen Abschnitt ab hier"
                onSelect={onSplitAbove}
              />
            ) : null}
          </>
        ) : null}

        {hasOriginal ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Originalzeile</DropdownMenuLabel>
            {onReparse ? (
              <MenuAction icon={<ScanText />} label="Neu parsen" onSelect={onReparse} />
            ) : null}
            {onUseOriginalAsFreeText ? (
              <MenuAction
                icon={<Unlink />}
                label="Original als Freitext übernehmen"
                onSelect={onUseOriginalAsFreeText}
              />
            ) : null}
          </>
        ) : null}

        <DropdownMenuSeparator />
        <MenuAction
          icon={<Trash2 />}
          label="Zutat entfernen"
          onSelect={onRemove}
          className="text-[var(--color-danger)] focus:text-[var(--color-danger)]"
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MenuAction({
  icon,
  label,
  onSelect,
  className,
}: {
  icon: React.ReactNode;
  label: string;
  onSelect: () => void;
  className?: string;
}) {
  return (
    <DropdownMenuItem
      onSelect={onSelect}
      className={cn("min-h-11 gap-3 [&_svg]:size-4 [&_svg]:shrink-0", className)}
    >
      {icon}
      {label}
    </DropdownMenuItem>
  );
}

function ToggleItem({
  checked,
  onSelect,
  icon,
  label,
  hint,
}: {
  checked: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  label: string;
  hint?: string;
}) {
  return (
    <DropdownMenuItem
      role="menuitemcheckbox"
      aria-checked={checked}
      onSelect={onSelect}
      className="min-h-11 gap-3 [&_svg]:size-4 [&_svg]:shrink-0"
    >
      <span
        className={cn(
          "inline-flex size-5 shrink-0 items-center justify-center rounded border",
          checked
            ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-accent-fg)] [&_svg]:size-3.5"
            : "border-[var(--color-border)] text-transparent",
        )}
      >
        {checked ? <Check /> : null}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="inline-flex items-center gap-1.5">
          <span className="text-[var(--color-muted-fg)] [&_svg]:size-3.5">{icon}</span>
          {label}
        </span>
        {hint ? (
          <span className="text-xs text-[var(--color-muted-fg)]">{hint}</span>
        ) : null}
      </span>
    </DropdownMenuItem>
  );
}
