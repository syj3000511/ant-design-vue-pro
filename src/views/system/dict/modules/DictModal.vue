<template>
  <a-modal
    :title="title"
    :width="520"
    :visible="visible"
    :confirmLoading="confirmLoading"
    wrapClassName="xbom-glass-modal"
    @ok="handleSubmit"
    @cancel="handleCancel"
    :bodyStyle="{ padding: '16px 24px' }"
    centered
  >
    <a-form-model
      ref="form"
      :model="model"
      :rules="rules"
      layout="vertical"
      class="xbom-body-font"
    >
      <div class="industrial-info-alert">
        <a-icon type="info-circle" />
        <span>定义系统全局常量模型，类型编码一经登记不可更改。</span>
      </div>

      <a-form-model-item label="字典显示名称 (Display Name)" prop="name">
        <a-input v-model="model.name" placeholder="例如: 生产设备状态" />
      </a-form-model-item>

      <a-form-model-item label="类型识别编码 (Type Code)" prop="type">
        <a-input v-model="model.type" placeholder="例如: eqp_status" class="xbom-tech-font industrial-code-input" />
      </a-form-model-item>

      <a-form-model-item label="业务备注 (Business Remark)" prop="remark">
        <a-textarea v-model="model.remark" placeholder="说明该字典项在制造流程中的应用领域..." :rows="3" />
      </a-form-model-item>
    </a-form-model>
  </a-modal>
</template>

<script>
export default {
  name: 'DictModal',
  data () {
    return {
      title: '操作',
      visible: false,
      confirmLoading: false,
      model: {
        id: 0,
        name: '',
        type: '',
        remark: ''
      },
      rules: {
        name: [{ required: true, message: '请录入字典名称', trigger: 'blur' }],
        type: [{ required: true, message: '请录入识别编码', trigger: 'blur' }]
      }
    }
  },
  methods: {
    add () {
      this.edit({ id: 0, name: '', type: '', remark: '' })
    },
    edit (record) {
      this.model = Object.assign({}, record)
      this.visible = true
      this.title = record.id > 0 ? '变更字典定义' : '登记新字典项目'
      this.$nextTick(() => {
        this.$refs.form.clearValidate()
      })
    },
    handleCancel () {
      this.visible = false
    },
    handleSubmit () {
      this.$refs.form.validate(valid => {
        if (valid) {
          this.confirmLoading = true
          this.$emit('ok', this.model)
        }
      })
    },
    closeLoading () {
      this.confirmLoading = false
      this.visible = false
    }
  }
}
</script>

<style lang="less" scoped>
.industrial-info-alert {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #f0f5ff;
  border: 1px solid #adc6ff;
  padding: 8px 12px;
  border-radius: 2px;
  color: #003a8c;
  font-size: 13px;
  margin-bottom: 20px;

  .anticon {
    font-size: 14px;
    color: #1890ff;
  }
}

.industrial-code-input {
  background: #fafafa !important;
  color: #003a8c;
  font-weight: 600;
  text-transform: lowercase;
}

:deep(.ant-form-item-label) {
  padding-bottom: 4px;
  label {
    font-weight: 500;
    color: #595959;
  }
}
</style>
