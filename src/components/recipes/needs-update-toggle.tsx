"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/cn";

/**
 * Recipe-detail button that marks the recipe for a later edit (or clears the
 * mark). Marking first asks for an optional short reason (shown as a hint at
 * the top of the recipe); clearing is immediate and drops the reason and any
 * flagged ingredient lines with it. Backed by
 * `PATCH /api/v1/recipes/[id]/needs-update`, optimistic, reverts on failure.
 * `router.refresh()` re-renders the server view so the hint appears/vanishes.
 */
export function NeedsUpdateToggle({
  recipeId,
  initial,
  size,
  iconOnly = false,
  onChanged,
}: {
  recipeId: number;
  initial: boolean;
  /** Forwarded to the underlying Button — use "sm" to match adjacent small
   *  buttons (e.g. in the recipe preview dialog header). */
  size?: React.ComponentProps<typeof Button>["size"];
  /** Compact wrench-only rendering for tight rows (e.g. the meal rows in
   *  the "Mahlzeiten hinzufügen" dialog). The label moves into the
   *  aria-label; the tooltip stays. */
  iconOnly?: boolean;
  /** Called after a successful write — for client-fetched views (the recipe
   *  preview dialog) that must reload to show the reason hint. */
  onChanged?: () => void;
}) {
  const router = useRouter();
  const [needsUpdate, setNeedsUpdate] = React.useState(initial);
  const [saving, setSaving] = React.useState(false);
  const [asking, setAsking] = React.useState(false);

  async function save(next: boolean, note?: string) {
    setSaving(true);
    setNeedsUpdate(next);
    try {
      const res = await fetch(`/api/v1/recipes/${recipeId}/needs-update`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ needsUpdate: next, note: note ?? null }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      router.refresh();
      onChanged?.();
    } catch {
      setNeedsUpdate(!next);
    } finally {
      setSaving(false);
    }
  }

  const label = needsUpdate ? "Update vorgemerkt" : "Update vormerken";

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size={size}
        onClick={() => (needsUpdate ? void save(false) : setAsking(true))}
        disabled={saving}
        aria-pressed={needsUpdate}
        aria-label={iconOnly ? label : undefined}
        title={
          needsUpdate
            ? "Update-Markierung entfernen"
            : "Rezept für ein späteres Update vormerken"
        }
        className={cn(
          iconOnly && "h-7 w-7 p-0",
          needsUpdate &&
            "border-[var(--color-warning)] bg-[color-mix(in_srgb,var(--color-warning),transparent_85%)] text-[var(--color-warning)] hover:bg-[color-mix(in_srgb,var(--color-warning),transparent_75%)]",
        )}
      >
        <Wrench className="size-4" />
        {iconOnly ? null : label}
      </Button>
      <NeedsUpdateReasonDialog
        open={asking}
        onClose={() => setAsking(false)}
        onConfirm={(note) => void save(true, note)}
      />
    </>
  );
}

/**
 * Asks for the optional reason when flagging a recipe from its own view. The
 * text field is focused so the user can type right away; submitting with an
 * empty field flags without a reason.
 */
function NeedsUpdateReasonDialog({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (note: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-md">
        {/* Remount per opening so the field starts empty. */}
        {open ? (
          <ReasonForm
            description="Das Rezept wird für ein späteres Update vorgemerkt."
            submitDisabled={false}
            onCancel={onClose}
            onSubmit={(note) => {
              onConfirm(note);
              onClose();
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Header, optional-reason field and footer shared by the "Update vormerken"
 * dialogs (recipe view and shopping list). `children` render between the
 * description and the reason field (the shopping list's recipe picker).
 */
export function ReasonForm({
  description,
  children,
  submitDisabled,
  onCancel,
  onSubmit,
}: {
  description: React.ReactNode;
  children?: React.ReactNode;
  submitDisabled: boolean;
  onCancel: () => void;
  onSubmit: (note: string) => void;
}) {
  const [note, setNote] = React.useState("");
  const submit = () => {
    if (!submitDisabled) onSubmit(note.trim());
  };
  return (
    <form
      // Keeps DialogContent's header/body/footer column layout intact.
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <DialogHeader>
        <DialogTitle>Update vormerken</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <DialogBody className="flex flex-col gap-3">
        {children}
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">
            Was ist zu tun?{" "}
            <span className="font-normal text-[var(--color-muted-fg)]">(optional)</span>
          </span>
          <Textarea
            autoFocus
            rows={2}
            maxLength={1000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            // Enter submits, Shift+Enter breaks the line — a short reason is
            // the common case.
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="z. B. Menge stimmt nicht, Schritt fehlt …"
            className="min-h-16"
          />
        </label>
      </DialogBody>
      <DialogFooter className="sm:items-center sm:justify-between">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Abbrechen
        </Button>
        <Button type="submit" variant="primary" disabled={submitDisabled}>
          <Wrench className="mr-2 size-4" />
          Vormerken
        </Button>
      </DialogFooter>
    </form>
  );
}
