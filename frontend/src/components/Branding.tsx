import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiUpload } from "@/lib/api";
import { toast } from "sonner";
import { errorMessage } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

type Settings = {hero_url: string; logo_url: string};
export const useBranding = () => useQuery({queryKey: ["branding"], queryFn: () => apiGet<Settings>("/settings")});

export function BrandLogo() {
  const {data} = useBranding();
  return <img src={data?.logo_url || "/pastoral.svg"} alt="Pastoral Familiar" className="size-full object-contain" />;
}

export function BrandingUpload() {
  const qc = useQueryClient();
  const {data} = useBranding();
  const save = useMutation({
    mutationFn: ({file, kind}: {file: File; kind: "hero" | "logo"}) => apiUpload<Settings>(`/settings/images/${kind}`, file),
    onSuccess: settings => {
      qc.setQueryData(["branding"], settings);
      toast.success("Imagem atualizada");
    },
    onError: error => toast.error(errorMessage(error)),
  });

  function upload(file: File | undefined, kind: "hero" | "logo") {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 1024 * 1024) {
      toast.error("Escolha PNG, JPEG ou WebP de até 1 MB");
      return;
    }
    save.mutate({file, kind});
  }

  return (
    <Card className="rounded-2xl bg-white" data-testid="branding-settings">
      <CardHeader>
        <CardTitle className="font-serif text-2xl font-semibold text-slate-900">Imagens da pastoral</CardTitle>
        <CardDescription>Personalize a foto inicial e o logo exibidos na agenda e nas telas de entrada.</CardDescription>
      </CardHeader>
      <CardContent>
      <div className="grid gap-6 sm:grid-cols-2">
        {(["hero", "logo"] as const).map(kind => (
          <div key={kind} className="min-w-0 space-y-3">
            <Label htmlFor={`branding-${kind}`}>{kind === "hero" ? "Foto inicial" : "Logo"}</Label>
            <div className="flex h-40 items-center justify-center overflow-hidden rounded-xl border border-amber-900/10 bg-amber-50/60">
              {data?.[kind === "hero" ? "hero_url" : "logo_url"] || kind === "logo" ? (
                <img src={data?.[kind === "hero" ? "hero_url" : "logo_url"] || "/pastoral.svg"}
                  alt={kind === "hero" ? "Foto inicial atual" : "Logo atual"}
                  className={kind === "hero" ? "size-full object-cover" : "size-28 object-contain"} />
              ) : <p className="text-sm text-slate-500">Foto padrão da pastoral</p>}
            </div>
            <Input id={`branding-${kind}`} type="file" accept="image/png,image/jpeg,image/webp"
              disabled={!data || save.isPending}
              onChange={event => {upload(event.target.files?.[0], kind); event.target.value = "";}} />
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-slate-500" role="status">
        {save.isPending ? "Enviando imagem…" : "PNG, JPEG ou WebP, até 1 MB por imagem."}
      </p>
      </CardContent>
    </Card>
  );
}
