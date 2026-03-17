import type { Item } from "@shared/types/sapo.types";
import type { TaxSelection } from "./batch.types";

export function patchTaxInfos(item: Item, taxSelection: TaxSelection): Item {
  return {
    ...item,
    tax_infos: {
      vat_pit_category_code: taxSelection.code,
      vat_pit_category_name: taxSelection.name
    }
  };
}
