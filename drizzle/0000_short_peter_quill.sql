-- Baseline gerado a partir do banco existente. Não execute este arquivo em
-- produção: o schema já foi aplicado pelas migrations em supabase/migrations/.
CREATE TYPE "public"."atendimento_state" AS ENUM('aguardando_confirmacao', 'recusado', 'em_andamento', 'faturamento', 'pagamento', 'concluido');--> statement-breakpoint
CREATE TYPE "public"."transacao_tipo" AS ENUM('entrada', 'saida');--> statement-breakpoint
CREATE TABLE "atendimentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cliente_id" uuid NOT NULL,
	"servico_id" uuid,
	"state" "atendimento_state" DEFAULT 'aguardando_confirmacao' NOT NULL,
	"valor_centavos" integer,
	"pix_brcode" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"descricao_solicitacao" text,
	"servico_ids" uuid[] DEFAULT ARRAY[]::uuid[] NOT NULL,
	"desconto_centavos" integer DEFAULT 0 NOT NULL,
	"criado_por_user_id" uuid,
	"vendido_por_user_id" uuid,
	"atendido_por_user_id" uuid,
	"acrescimo_centavos" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clientes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"whatsapp" text NOT NULL,
	"instagram" text,
	"email" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"observacao" text,
	"cadastrado_por_user_id" uuid,
	"marketing_opt_in" boolean DEFAULT true NOT NULL,
	"marketing_opt_in_at" timestamp with time zone,
	"marketing_opt_out_at" timestamp with time zone,
	"resend_contact_id" text
);
--> statement-breakpoint
CREATE TABLE "marketing_campanha_destinatarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campanha_id" uuid NOT NULL,
	"cliente_id" uuid,
	"nome" text NOT NULL,
	"email" text NOT NULL,
	"whatsapp" text,
	"resend_contact_id" text,
	"status" text DEFAULT 'pendente' NOT NULL,
	"erro" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketing_campanhas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"assunto" text NOT NULL,
	"mensagem" text NOT NULL,
	"texto_previa" text,
	"servico_id" uuid,
	"somente_vendas_contabilizadas" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'rascunho' NOT NULL,
	"total_destinatarios" integer DEFAULT 0 NOT NULL,
	"agendada_para" timestamp with time zone,
	"enviada_em" timestamp with time zone,
	"resend_segment_id" text,
	"resend_broadcast_id" text,
	"erro" text,
	"criado_por_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketing_eventos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campanha_id" uuid,
	"destinatario_id" uuid,
	"tipo" text NOT NULL,
	"resend_email_id" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pix_recebedor_config" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"pix_key" text DEFAULT '' NOT NULL,
	"receiver_name" text DEFAULT '' NOT NULL,
	"receiver_city" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"full_name" text,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "servico_categorias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"descricao" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "servico_comentarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"servico_id" uuid NOT NULL,
	"parent_id" uuid,
	"user_id" uuid NOT NULL,
	"author_name" text NOT NULL,
	"author_email" text,
	"author_avatar_url" text,
	"texto" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "servicos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"valor_centavos" integer NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"descricao" text,
	"imagem_url" text,
	"categoria_id" uuid,
	"vitrine" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transacoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tipo" "transacao_tipo" NOT NULL,
	"valor_centavos" integer NOT NULL,
	"descricao" text NOT NULL,
	"atendimento_id" uuid,
	"data" date DEFAULT CURRENT_DATE NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_login_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"email" text,
	"device_hash" text NOT NULL,
	"device_label" text NOT NULL,
	"user_agent" text,
	"ip_address" text,
	"country" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
