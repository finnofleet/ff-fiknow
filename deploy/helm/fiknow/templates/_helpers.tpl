{{/* Chart-Name (mit Override). */}}
{{- define "fiknow.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/* Voll qualifizierter Name. */}}
{{- define "fiknow.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{- define "fiknow.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "fiknow.labels" -}}
helm.sh/chart: {{ include "fiknow.chart" . }}
{{ include "fiknow.selectorLabels" . }}
app.kubernetes.io/version: {{ .Values.image.tag | default .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{- define "fiknow.selectorLabels" -}}
app.kubernetes.io/name: {{ include "fiknow.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "fiknow.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
{{- default (include "fiknow.fullname" .) .Values.serviceAccount.name -}}
{{- else -}}
{{- default "default" .Values.serviceAccount.name -}}
{{- end -}}
{{- end -}}

{{/* Name des Secrets, aus dem die Env gezogen wird (existing oder selbst erzeugt). */}}
{{- define "fiknow.secretName" -}}
{{- if .Values.secret.existingSecret -}}
{{- .Values.secret.existingSecret -}}
{{- else -}}
{{- printf "%s-env" (include "fiknow.fullname" .) -}}
{{- end -}}
{{- end -}}

{{/*
Effektive OIDC_REDIRECT_BASE: expliziter Wert, sonst aus dem ersten
ingress-Host (https) abgeleitet. Leer, wenn keins von beidem da ist —
dann muss der Wert anderweitig gesetzt werden (Prod fail-closed).
*/}}
{{- define "fiknow.redirectBase" -}}
{{- if .Values.config.OIDC_REDIRECT_BASE -}}
{{- .Values.config.OIDC_REDIRECT_BASE -}}
{{- else if and .Values.ingress.enabled (gt (len .Values.ingress.hosts) 0) -}}
{{- $h := (index .Values.ingress.hosts 0).host -}}
{{- if $h -}}https://{{ $h }}{{- end -}}
{{- end -}}
{{- end -}}

{{/* Fail-fast-Validierung kritischer Config (vor dem Apply). */}}
{{- define "fiknow.validate" -}}
{{- if eq (.Values.config.AUTH_PROVIDER | default "gotrue") "oidc" -}}
{{- if not .Values.config.OIDC_ISSUER -}}
{{- fail "config.OIDC_ISSUER muss gesetzt sein, wenn AUTH_PROVIDER=oidc." -}}
{{- end -}}
{{- if not (include "fiknow.redirectBase" .) -}}
{{- fail "OIDC_REDIRECT_BASE (oder ingress.hosts[0].host) muss bei AUTH_PROVIDER=oidc gesetzt sein — die App leitet die redirect_uri in Prod nicht aus Request-Headern ab (fail-closed)." -}}
{{- end -}}
{{- end -}}
{{- if and (not .Values.secret.existingSecret) (not .Values.secret.create) -}}
{{- fail "Keine Secrets konfiguriert: entweder secret.existingSecret setzen oder secret.create=true mit secret.data." -}}
{{- end -}}
{{/* MCP/Authoring braucht persistenten Speicher — emptyDir verliert Bundles. */}}
{{- $mcp := "" -}}
{{- with .Values.config.extra -}}{{- $mcp = index . "MCP_ENABLED" | default $mcp -}}{{- end -}}
{{- with .Values.config.MCP_ENABLED -}}{{- $mcp = . -}}{{- end -}}
{{- if eq (toString $mcp) "true" -}}
{{- if ne (.Values.dataVolume.type | default "emptyDir") "pvc" -}}
{{- fail "MCP_ENABLED=true braucht persistenten, geteilten Speicher: dataVolume.type=pvc mit existingClaim (bei >=2 Replicas ReadWriteMany/RWX). Mit emptyDir gehen Kurs-Bundles und Medien bei Pod-Neustart verloren und sind ueber Replicas inkonsistent." -}}
{{- end -}}
{{- end -}}
{{- end -}}
