"use client";

import { useState, useRef, useEffect } from "react";
import { Send, User, ShieldCheck, Paperclip } from "lucide-react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { pl } from "date-fns/locale";
import { addTicketReply, addTicketReplyWithFiles, type TicketAttachment, type TicketDetail } from "../actions";
import { clientTicketAttachmentDownloadHref } from "../attachment-links";
import { toast } from "sonner";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb >= 100 ? 0 : 1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function AttachmentChips({
  ticketId,
  attachments,
  variant = "primary",
  align = "end",
}: {
  ticketId: string;
  attachments: TicketAttachment[];
  variant?: "primary" | "neutral";
  align?: "start" | "end";
}) {
  if (!attachments?.length) return null;
  const link =
    variant === "primary"
      ? "border-primary-foreground/20 bg-primary-foreground/10 hover:bg-primary-foreground/20 text-primary-foreground"
      : "border-border bg-muted/50 hover:bg-muted text-foreground";
  return (
    <div className={`mt-2 flex flex-wrap gap-1.5 ${align === "end" ? "justify-end" : "justify-start"} empty:hidden`}>
      {attachments.map((a) => (
        <a
          key={a.id}
          href={clientTicketAttachmentDownloadHref(ticketId, a.id)}
          className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[11px] font-medium ${link}`}
          target="_blank"
          rel="noreferrer"
        >
          <Paperclip className="h-3 w-3 shrink-0 opacity-90" />
          <span className="max-w-[14rem] truncate">{a.originalName}</span>
          <span className="opacity-70">({formatBytes(a.sizeBytes)})</span>
        </a>
      ))}
    </div>
  );
}

/** Załączniki przy pierwszej wiadomości mają replyId=null i mogą pochodzić z zbiorczego pola ticket.attachments. */
function openingAttachments(ticket: TicketDetail): TicketAttachment[] {
  const all = ticket.attachments ?? [];
  return all.filter((a) => a.replyId == null);
}

export default function ClientTicketChat({ ticket }: { ticket: TicketDetail }) {
  const router = useRouter();
  const [replyText, setReplyText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [filesSelectedNonEmpty, setFilesSelectedNonEmpty] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Zjeżdżanie na dół przy załadowaniu i odświeżeniu
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [ticket.replies.length]);

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    const files = fileInputRef.current?.files;
    let hasFiles = false;
    if (files?.length) {
      for (let i = 0; i < files.length; i += 1) {
        if (files[i]?.size > 0) hasFiles = true;
      }
    }
    const trimmed = replyText.trim();
    if (!trimmed && !hasFiles) return;

    setSubmitting(true);

    let res:
      | Awaited<ReturnType<typeof addTicketReply>>
      | Awaited<ReturnType<typeof addTicketReplyWithFiles>>;

    if (hasFiles) {
      const fd = new FormData();
      fd.append("message", trimmed);
      if (files) {
        for (let i = 0; i < files.length; i += 1) {
          const f = files.item(i);
          if (f && f.size > 0) fd.append("files", f);
        }
      }
      res = await addTicketReplyWithFiles(ticket.id, fd);
    } else {
      res = await addTicketReply(ticket.id, trimmed);
    }

    setSubmitting(false);

    if (res?.error) {
      toast.error("Błąd", { description: res.error });
    } else {
      setReplyText("");
      setFilesSelectedNonEmpty(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      router.refresh();
      // setTimeout na scroll to bottom on refresh
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 300);
      toast.success("Odpowiedź została wysłana", {
        description: "Przekazano informację do administracji.",
      });
    }
  };

  return (
    <>
      {/* Lista Wiadomości */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 scrollbar-hide bg-muted/10">
        
        {/* Główna wiadomość */}
        <div className="flex flex-col gap-1.5 items-end max-w-[90%] md:max-w-[75%] ml-auto">
          <span className="text-xs text-muted-foreground mr-2 font-medium">
            Ty - {format(new Date(ticket.createdAt), "d MMM, HH:mm", { locale: pl })}
          </span>
          <div className="rounded-2xl rounded-tr-sm px-5 py-3.5 text-sm bg-primary text-primary-foreground shadow-sm shadow-primary/20 leading-relaxed whitespace-pre-wrap">
            {ticket.message}
            <AttachmentChips ticketId={ticket.id} attachments={openingAttachments(ticket)} />
          </div>
        </div>

        {/* Odpowiedzi i Logi */}
        {ticket.replies.map((reply) => {
          const isMe = !reply.isStaff;
          return (
            <div
              key={reply.id}
              className={`flex flex-col gap-1.5 max-w-[90%] md:max-w-[75%] ${
                isMe ? "items-end ml-auto" : "items-start"
              }`}
            >
              <span
                className={`text-xs text-muted-foreground font-medium flex items-center gap-1.5 ${
                  isMe ? "mr-2" : "ml-2"
                }`}
              >
                {isMe ? (
                  <>
                    Ty - {format(new Date(reply.createdAt), "d MMM, HH:mm", { locale: pl })}
                    <User className="h-3 w-3" />
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                    Wsparcie EkoHost - {format(new Date(reply.createdAt), "d MMM, HH:mm", { locale: pl })}
                  </>
                )}
              </span>
              <div
                className={`rounded-2xl px-5 py-3.5 text-sm leading-relaxed whitespace-pre-wrap ${
                  isMe
                    ? "rounded-tr-sm bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                    : "rounded-tl-sm bg-background border border-border text-foreground shadow-sm"
                }`}
              >
                {reply.message}
                {reply.attachments?.length ? (
                  <AttachmentChips
                    ticketId={ticket.id}
                    attachments={reply.attachments}
                    variant={isMe ? "primary" : "neutral"}
                    align={isMe ? "end" : "start"}
                  />
                ) : null}
              </div>
            </div>
          );
        })}
        <div ref={chatEndRef} />
      </div>

      {/* Akcje dolne */}
      <div className="p-4 border-t border-border/50 bg-background rounded-b-xl">
        <form onSubmit={handleReply} className="relative">
          <textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder={
              ticket.status === "CLOSED"
                ? "Zgłoszenie jest rozwiązane. Wpisz tutaj treść i wyślij jeśli chcesz je ponowić..."
                : "Napisz odpowiedź do administracji..."
            }
            className="w-full min-h-[100px] resize-none rounded-xl border border-input bg-card px-4 py-3 pb-14 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-50 pr-14 scrollbar-hide"
            disabled={submitting}
          />
          <input
            ref={fileInputRef}
            type="file"
            name="ticketFiles"
            multiple
            className="hidden"
            onChange={(e) => {
              const list = e.target.files;
              let ok = false;
              if (list) {
                for (let i = 0; i < list.length; i += 1) {
                  if ((list.item(i)?.size ?? 0) > 0) ok = true;
                }
              }
              setFilesSelectedNonEmpty(ok);
            }}
          />
          <button
            type="button"
            disabled={submitting}
            className="absolute bottom-11 left-3 inline-flex items-center gap-2 rounded-lg border border-input bg-background px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted"
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip className="h-3.5 w-3.5" />
            Załączniki (max 5 × 8 MB)
          </button>
          <button
            type="submit"
            disabled={submitting || (!replyText.trim() && !filesSelectedNonEmpty)}
            className="absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50 shadow-sm"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </>
  );
}
