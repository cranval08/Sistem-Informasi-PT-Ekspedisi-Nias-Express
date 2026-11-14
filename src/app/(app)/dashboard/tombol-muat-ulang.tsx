"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function TombolMuatUlang() {
  const router = useRouter();
  const [proses, mulai] = useTransition();
  return (
    <Button type="button" variant="outline" size="sm" disabled={proses} onClick={() => mulai(() => router.refresh())}>
      {proses ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />} Muat ulang data
    </Button>
  );
}
