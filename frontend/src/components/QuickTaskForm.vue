<template>
  <v-form ref="formRef" class="quick-task-form" @submit.prevent>
    <!-- 第一行：测试类型在左，目标输入在右（解析信息在输入框右侧） -->
    <v-row no-gutters class="row-1">
      <v-col cols="12" sm="3" class="col-type">
        <v-select
          v-model="form.task_type"
          :items="taskTypeItems"
          item-title="title"
          item-value="value"
          :label="$t('quickTaskForm.testType')"
          variant="outlined"
          density="compact"
          :rules="taskTypeRules"
          hide-details="auto"
          @update:model-value="handleTaskTypeChange"
        />
      </v-col>

      <v-col cols="12" sm="9" class="col-target">
        <v-text-field
          v-model="form.target"
          :label="$t('quickTaskForm.target')"
          :placeholder="$t('quickTaskForm.targetPlaceholder')"
          variant="outlined"
          density="compact"
          clearable
          :rules="targetRules"
          hide-details="auto"
          @update:model-value="handleTargetInput"
        >
          <template #append-inner>
            <div class="target-info">
              <v-chip
                v-if="targetType"
                size="x-small"
                variant="tonal"
                :color="targetType === 'ip' ? 'success' : 'primary'"
              >
                {{ targetType === 'ip' ? $t('home.targetTypeIp') : $t('home.targetTypeDomain') }}
              </v-chip>

              <v-tooltip v-if="geoInfo" location="top">
                <template #activator="{ props }">
                  <v-icon v-bind="props" size="18" icon="mdi-map-marker" class="geo-icon" />
                </template>
                <span>{{ geoInfo }}</span>
              </v-tooltip>
            </div>
          </template>
        </v-text-field>
      </v-col>
    </v-row>

    <!-- 第二行：DNS配置 + 网络栈 + 测试次数 -->
    <div class="row-2">
      <v-select
        v-if="isDomainTarget"
        v-model="form.dns_mode"
        :items="dnsModeItems"
        item-title="title"
        item-value="value"
        :label="$t('quickTaskForm.dns')"
        variant="outlined"
        density="compact"
        hide-details
        class="dns-select"
      />

      <v-text-field
        v-if="form.dns_mode === 'custom' && isDomainTarget"
        v-model="form.custom_dns"
        :label="$t('quickTaskForm.dnsServer')"
        :placeholder="$t('quickTaskForm.dnsServer')"
        variant="outlined"
        density="compact"
        hide-details
        class="dns-input"
      />

      <v-btn-toggle
        v-model="form.ip_version"
        density="compact"
        variant="outlined"
        mandatory
        class="ip-toggle"
      >
        <v-btn value="auto">{{ $t('home.ipAuto') }}</v-btn>
        <v-btn value="ipv4">{{ $t('home.ipV4') }}</v-btn>
        <v-btn value="ipv6">{{ $t('home.ipV6') }}</v-btn>
      </v-btn-toggle>

      <v-text-field
        v-if="showCountInput"
        v-model.number="form.count"
        type="number"
        :min="1"
        :max="100"
        :step="1"
        :label="$t('quickTaskForm.count')"
        variant="outlined"
        density="compact"
        hide-details
        class="count-input"
      />
    </div>

    <div
      v-if="form.task_type === 'traceroute' || form.task_type === 'mtr'"
      class="row-probe"
    >
      <v-select
        v-model="selectedProbeIds"
        :items="availableProbeItems"
        item-title="title"
        item-value="value"
        :label="$t('home.probeLabel')"
        multiple
        chips
        variant="outlined"
        density="compact"
        hide-details
      />
    </div>

    <!-- 第三行：测试按钮 -->
    <div class="row-3">
      <v-btn
        v-if="form.task_type === 'traceroute'"
        color="primary"
        :loading="loading"
        block
        @click="handleSubmit('single')"
      >
        <v-icon icon="mdi-flash" start />
        {{ $t('quickTaskForm.startTraceroute') }}
      </v-btn>

      <v-btn
        v-else-if="form.task_type === 'mtr'"
        color="primary"
        :loading="loading"
        block
        @click="handleSubmit('continuous')"
      >
        <v-icon icon="mdi-flash" start />
        {{ $t('quickTaskForm.monitorMtr') }}
      </v-btn>

      <v-btn
        v-else-if="form.task_type === 'http_test'"
        color="primary"
        :loading="loading"
        block
        @click="handleSubmit('single')"
      >
        <v-icon icon="mdi-flash" start />
        {{ $t('quickTaskForm.startHttpTest') }}
      </v-btn>

      <template v-else>
        <v-btn
          color="primary"
          class="half"
          :loading="singleLoading"
          @click="handleSubmit('single')"
        >
          <v-icon icon="mdi-flash" start />
          {{ $t('home.startTest') }}
        </v-btn>
        <v-btn
          color="success"
          class="half"
          :loading="continuousLoading"
          @click="handleSubmit('continuous')"
        >
          <v-icon icon="mdi-monitor" start />
          {{ $t('home.startMonitor') }}
        </v-btn>
      </template>
    </div>
  </v-form>
</template>

<script setup lang="ts">
import { ref, reactive, computed, nextTick, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTaskStore } from '@/stores/task'
import type { Task } from '@/types'
import { useUiStore } from '@/stores/ui'
import api from '@/utils/request'

const ui = useUiStore()
const emit = defineEmits<{
  created: [taskId: string]
}>()

const taskStore = useTaskStore()
const { t: $t } = useI18n()

const formRef = ref<any>(null)

const loading = ref(false)
const singleLoading = ref(false)
const continuousLoading = ref(false)

const targetType = ref<'ip' | 'domain' | ''>('')
const geoInfo = ref('')
const selectedProbeIds = ref<string[]>([])

type ProbeRecord = {
  probe_id: string
  name: string
  location: string
}

const availableProbes = ref<ProbeRecord[]>([])

const availableProbeItems = computed(() =>
  availableProbes.value.map((p) => ({
    title: `${p.name}（${p.location}）`,
    value: p.probe_id,
  }))
)

async function loadAvailableProbes() {
  try {
    type ProbesResponse = {
      probes?: ProbeRecord[]
    }
    const res = await api.get<ProbesResponse>('/probes', { params: { status: 'online' } })
    availableProbes.value = res.probes || []
  } catch (e) {
    console.error('Failed to load probes:', e)
  }
}

onMounted(() => {
  void loadAvailableProbes()
})

const form = reactive({
  task_type: 'icmp_ping' as Task['task_type'],
  target: '',
  count: 4,
  mode: 'single' as Task['mode'],
  ip_version: 'auto' as 'auto' | 'ipv4' | 'ipv6',
  dns_mode: 'remote' as 'remote' | 'custom',
  custom_dns: '',
})

const taskTypeItems = computed(() => [
  { title: String($t('taskTable.typeNames.icmp_ping')), value: 'icmp_ping' },
  { title: String($t('taskTable.typeNames.tcp_ping')), value: 'tcp_ping' },
  { title: String($t('quickTaskForm.httpTest')), value: 'http_test' },
  { title: String($t('taskTable.typeNames.mtr')), value: 'mtr' },
  { title: String($t('taskTable.typeNames.traceroute')), value: 'traceroute' },
])

const dnsModeItems = computed(() => [
  { title: String($t('quickTaskForm.dnsRemote')), value: 'remote' },
  { title: String($t('quickTaskForm.dnsCustom')), value: 'custom' },
])

const taskTypeRules = computed(() => [
  (v: unknown) => (!!v ? true : String($t('quickTaskForm.validation.selectTestType'))),
])

const targetRules = computed(() => [
  (v: unknown) => (!!String(v || '').trim() ? true : String($t('quickTaskForm.validation.enterTarget'))),
  (v: unknown) => {
    const value = String(v || '').trim()
    if (!value) return true

    const ipv4 = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/
    const domain = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/

    return ipv4.test(value) || domain.test(value) ? true : String($t('quickTaskForm.validation.invalidTarget'))
  },
])

// 判断是否为域名目标
const isDomainTarget = computed(() => targetType.value === 'domain')

// 判断是否显示测试次数输入
const showCountInput = computed(() => {
  return ['icmp_ping', 'tcp_ping'].includes(form.task_type)
})

// IPv4 正则表达式
const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/

// IPv6 正则表达式（简化版）
const ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/

// 检测目标类型并获取GeoIP信息
async function handleTargetInput() {
  const target = form.target.trim()

  if (!target) {
    targetType.value = ''
    geoInfo.value = ''
    return
  }

  // 检测是IP还是域名
  if (ipv4Regex.test(target) || ipv6Regex.test(target)) {
    targetType.value = 'ip'
    geoInfo.value = ''
    // 获取IP的GeoIP信息
    await fetchGeoInfo(target)
  } else {
    targetType.value = 'domain'
    geoInfo.value = ''
  }
}

// 获取IP的GeoIP信息
async function fetchGeoInfo(ip: string) {
  try {
    type GeoIPResponse = {
      success: boolean
      data?: {
        country?: string
        region?: string
        city?: string
        isp?: string
      }
    }
    const res = await api.get<GeoIPResponse>('/geoip', { params: { ip } })
    if (res.success && res.data) {
      const geo = res.data
      geoInfo.value = `${geo.country || ''} ${geo.region || ''} ${geo.city || ''} ${geo.isp || ''}`.trim()
    }
  } catch (error) {
    console.error('获取GeoIP信息失败:', error)
  }
}

// 任务类型变化时重置
function handleTaskTypeChange() {
  if (form.task_type !== 'traceroute' && form.task_type !== 'mtr') {
    selectedProbeIds.value = []
  }

  if (form.task_type === 'mtr') {
    form.mode = 'continuous'
  } else if (form.task_type === 'http_test') {
    form.mode = 'single'
    form.count = 1
  } else if (form.task_type === 'traceroute') {
    form.mode = 'single'
    form.count = 1
  } else {
    form.mode = 'single'
    form.count = 4
  }
}

async function validateForm(): Promise<boolean> {
  const res = await formRef.value?.validate?.()
  if (typeof res === 'boolean') return res
  if (res && typeof res.valid === 'boolean') return res.valid
  return true
}

function resetForm() {
  form.task_type = 'icmp_ping'
  form.target = ''
  form.count = 4
  form.mode = 'single'
  form.ip_version = 'auto'
  form.dns_mode = 'remote'
  form.custom_dns = ''

  targetType.value = ''
  geoInfo.value = ''
  selectedProbeIds.value = []

  void nextTick(() => {
    formRef.value?.resetValidation?.()
  })
}

async function handleSubmit(mode: 'single' | 'continuous') {
  // 设置加载状态
  if (mode === 'single') {
    singleLoading.value = true
  } else {
    continuousLoading.value = true
  }
  loading.value = true

  try {
    const valid = await validateForm()
    if (!valid) return

    // 验证DNS配置
    if (isDomainTarget.value && form.dns_mode === 'custom' && !form.custom_dns) {
      ui.notify(String($t('quickTaskForm.validation.enterCustomDns')), 'warning')
      return
    }

    const modeValue =
      form.task_type === 'http_test'
        ? 'single'
        : form.task_type === 'traceroute'
          ? 'single'
          : form.task_type === 'mtr'
            ? 'continuous'
            : mode

    // 持续 ping/tcp 固定 100 次（调度器 1s 间隔）
    let count = form.count
    if (modeValue === 'continuous' && (form.task_type === 'icmp_ping' || form.task_type === 'tcp_ping')) {
      count = 100
    }

    const parameters: Record<string, unknown> = {
      count,
      ip_version: form.ip_version,
    }

    // 添加DNS配置
    if (isDomainTarget.value) {
      parameters.dns_mode = form.dns_mode
      if (form.dns_mode === 'custom' && form.custom_dns) {
        parameters.custom_dns = form.custom_dns
      }
    }

    const task = await taskStore.createTask({
      task_type: form.task_type,
      mode: modeValue,
      target: form.target,
      ip_version: form.ip_version,
      parameters,
      assigned_probes: (form.task_type === 'traceroute' || form.task_type === 'mtr') ? selectedProbeIds.value : [],
      priority: 5,
    })

    resetForm()
    emit('created', task.task_id)
  } finally {
    singleLoading.value = false
    continuousLoading.value = false
    loading.value = false
  }
}
</script>

<style scoped>
.quick-task-form {
  width: 100%;
}

.row-1 {
  gap: 12px;
}

.col-type {
  padding-right: 10px;
}

.col-target {
  padding-left: 10px;
}

.target-info {
  display: flex;
  align-items: center;
  gap: 6px;
}

.geo-icon {
  color: var(--text-2);
}

.row-2 {
  margin-top: 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.dns-select {
  width: 150px;
}

.dns-input {
  width: 220px;
}

.ip-toggle {
  flex: 1;
  min-width: 240px;
}

.count-input {
  width: 140px;
}

.row-probe {
  margin-top: 12px;
}

.row-3 {
  margin-top: 12px;
  display: flex;
  gap: 10px;
}

.half {
  flex: 1;
}

@media (max-width: 600px) {
  .col-type,
  .col-target {
    padding: 0;
  }

  .row-3 {
    flex-direction: column;
  }
}
</style>
