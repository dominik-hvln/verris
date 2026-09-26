import { Mail } from 'lucide-react';
import { fetchMailSettings } from './actions';
import { MailSettingsForm } from './mail-settings-form';
import { BladStrony, wynik } from "@/components/blad-strony";

export const metadata = { title: 'Poczta — admin Verris' };

export default async function MailSettingsPage() {
  const w = await wynik(fetchMailSettings());
  if (!w.ok) return <BladStrony blad={w.blad} tytul="Poczta wychodząca" powrot={{ href: "/settings", label: "Ustawienia" }} />;
  const settings = w.dane;

  return (
    <div className="space-y-8 p-8">
      <div className="flex items-center gap-3">
        <Mail className="h-8 w-8 text-amber-400" />
        <div>
          <h1 className="text-[28px] lg:text-[34px]">Poczta wychodząca</h1>
          <p className="text-sm text-muted-foreground">
            Domyślnie Postfix na serwerze panelu. Opcjonalnie zewnętrzny relay SMTP.
          </p>
        </div>
      </div>
      <MailSettingsForm initial={settings} />
    </div>
  );
}
