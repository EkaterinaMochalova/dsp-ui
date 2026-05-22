<script>
  import { STATE_LABEL, STATE_COLOR, TYPE_LABEL } from '../lib/utils.js'

  export let state = null
  export let type = null

  $: label = state ? (STATE_LABEL[state] ?? state) : (TYPE_LABEL[type] ?? type)
  $: color = state ? (STATE_COLOR[state] ?? 'gray') : 'blue'
</script>

<span class="badge badge-{color}">{label}</span>
