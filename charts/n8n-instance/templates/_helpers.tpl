{{/*
Expand the name of the chart.
*/}}
{{- define "n8n-instance.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "n8n-instance.fullname" -}}
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
Create chart name and version as used by the chart label.
*/}}
{{- define "n8n-instance.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "n8n-instance.labels" -}}
helm.sh/chart: {{ include "n8n-instance.chart" . }}
{{ include "n8n-instance.selectorLabels" . }}
app: n8n
version: {{ .Values.n8nVersion | quote }}
mode: {{ ternary "queue" "regular" .Values.queueMode }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "n8n-instance.selectorLabels" -}}
app.kubernetes.io/name: {{ include "n8n-instance.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Calculate NodePort from version string
Converts version like "2.3.6" to port 30236
Formula: 30000 + major*100 + minor*10 + patch
*/}}
{{- define "n8n-instance.nodePort" -}}
{{- if .Values.service.nodePort }}
{{- .Values.service.nodePort }}
{{- else }}
{{- $version := .Values.n8nVersion | toString }}
{{- $parts := splitList "." $version }}
{{- $major := index $parts 0 | atoi }}
{{- $minor := index $parts 1 | default "0" | atoi }}
{{- $patch := index $parts 2 | default "0" | atoi }}
{{- add 30000 (add (mul $major 100) (add (mul $minor 10) $patch)) }}
{{- end }}
{{- end }}

{{/*
Database host
*/}}
{{- define "n8n-instance.dbHost" -}}
{{- if .Values.isolatedDB -}}
postgres-{{ .Release.Name }}.{{ .Release.Namespace }}.svc.cluster.local
{{- else -}}
{{- .Values.database.shared.host -}}
{{- end -}}
{{- end -}}

{{/*
Database credentials
*/}}
{{- define "n8n-instance.dbUsername" -}}
{{- if .Values.isolatedDB -}}
admin
{{- else -}}
{{- .Values.database.shared.username -}}
{{- end -}}
{{- end -}}

{{- define "n8n-instance.dbPassword" -}}
{{- if .Values.isolatedDB -}}
changeme123
{{- else -}}
{{- .Values.database.shared.password -}}
{{- end -}}
{{- end -}}

{{- define "n8n-instance.dbDatabase" -}}
{{- if .Values.isolatedDB -}}
n8n
{{- else -}}
{{- .Values.database.shared.database -}}
{{- end -}}
{{- end -}}
