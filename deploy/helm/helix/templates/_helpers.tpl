{{/*
Expand the name of the chart.
*/}}
{{- define "helix.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "helix.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Chart label.
*/}}
{{- define "helix.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels.
*/}}
{{- define "helix.labels" -}}
helm.sh/chart: {{ include "helix.chart" . }}
{{ include "helix.selectorLabels" . }}
app.kubernetes.io/version: {{ default .Chart.AppVersion .Values.image.tag | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: helix
{{- end }}

{{/*
Selector labels.
*/}}
{{- define "helix.selectorLabels" -}}
app.kubernetes.io/name: {{ include "helix.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app: {{ include "helix.name" . }}
{{- end }}

{{/*
Service account name.
*/}}
{{- define "helix.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "helix.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Image tag helper.
*/}}
{{- define "helix.imageTag" -}}
{{- default .Chart.AppVersion .Values.image.tag }}
{{- end }}

{{- define "helix.policySidecarImageTag" -}}
{{- default .Chart.AppVersion .Values.policySidecar.image.tag }}
{{- end }}

{{/*
Release namespace (may create).
*/}}
{{- define "helix.namespace" -}}
{{- default .Release.Namespace .Values.namespace }}
{{- end }}
