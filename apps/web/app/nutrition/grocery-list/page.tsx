import { AppLayout } from "../../../src/components/app-layout";
import { GroceryListScreen } from "../../../src/components/nutrition/grocery-list-screen";
import { PageContent, PageHeader } from "../../../src/components/ui";

export default function GroceryListPage() {
  return (
    <AppLayout>
      <PageHeader
        title="Закупка на неделю"
        description="Список сформирован из недельного рациона. Отмечайте купленное — это не меняет план."
      />
      <PageContent>
        <GroceryListScreen />
      </PageContent>
    </AppLayout>
  );
}
