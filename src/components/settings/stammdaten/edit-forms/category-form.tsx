"use client";

import * as React from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  TabCount,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

import { AliasChipEditor } from "../alias-chip-editor";
import {
  EntityReferenceList,
  ReferencePane,
  useImpactData,
} from "../impact-section";
import type { EditFormProps } from "../list-shell";

export type CategoryItem = {
  id: number;
  name: string;
  aliases: string[];
  usageCount: number;
  groupInRecipe: boolean;
};

export function CategoryForm({
  item,
  onPayloadChange,
}: EditFormProps<CategoryItem>) {
  const [name, setName] = React.useState(item?.name ?? "");
  const [aliases, setAliases] = React.useState<string[]>(item?.aliases ?? []);
  const [groupInRecipe, setGroupInRecipe] = React.useState(
    item?.groupInRecipe ?? false,
  );
  const impact = useImpactData("category", item?.id ?? -1, item != null);

  React.useEffect(() => {
    const trimmed = name.trim();
    onPayloadChange(
      {
        name: trimmed,
        aliases,
        groupInRecipe,
      },
      trimmed.length > 0,
    );
  }, [name, aliases, groupInRecipe, onPayloadChange]);

  const fields = (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="category-name">Name</Label>
        <Input
          id="category-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Aliase</Label>
        <AliasChipEditor value={aliases} onChange={setAliases} canonicalName={name} />
      </div>

      <label className="flex cursor-pointer items-start gap-2 text-sm">
        <Checkbox
          checked={groupInRecipe}
          onCheckedChange={(v) => setGroupInRecipe(Boolean(v))}
          className="mt-0.5"
        />
        <span className="flex-1">
          <span className="font-medium">In Rezepten gruppieren</span>
          <span className="mt-0.5 block text-xs text-[var(--color-muted-fg)]">
            Zutaten dieser Kategorie stehen in der Rezeptansicht in einem
            eigenen Block mit Überschrift unter den übrigen Zutaten.
          </span>
        </span>
      </label>
    </div>
  );

  // Create mode has no usage yet — render the fields bare.
  if (!item) return fields;

  const ingredients = impact.data?.linkedCategoryIngredients ?? [];
  const supermarkets = impact.data?.linkedCategorySupermarkets ?? [];
  return (
    <Tabs defaultValue="stammdaten">
      <TabsList className="mb-4 flex-wrap">
        <TabsTrigger value="stammdaten">Stammdaten</TabsTrigger>
        <TabsTrigger value="artikel">
          Artikel
          {impact.data && <TabCount count={ingredients.length} />}
        </TabsTrigger>
        <TabsTrigger value="supermaerkte">
          Supermärkte
          {impact.data && <TabCount count={supermarkets.length} />}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="stammdaten">{fields}</TabsContent>
      <TabsContent value="artikel">
        <ReferencePane
          loading={impact.loading}
          error={impact.error}
          isEmpty={ingredients.length === 0}
          emptyText="Keinem Artikel als Standard-Kategorie zugewiesen."
        >
          <EntityReferenceList
            items={ingredients}
            editHref={(id) => `/einstellungen/zutaten?edit=${id}`}
          />
        </ReferencePane>
      </TabsContent>
      <TabsContent value="supermaerkte">
        <ReferencePane
          loading={impact.loading}
          error={impact.error}
          isEmpty={supermarkets.length === 0}
          emptyText="Von keinem Supermarkt eingeordnet."
        >
          <EntityReferenceList
            items={supermarkets}
            editHref={(id) => `/einstellungen/supermaerkte?edit=${id}`}
          />
        </ReferencePane>
      </TabsContent>
    </Tabs>
  );
}
