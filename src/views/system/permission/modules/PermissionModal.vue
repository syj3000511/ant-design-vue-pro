<template>
  <a-modal
    :title="title"
    :width="600"
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
      :label-col="labelCol"
      :wrapper-col="wrapperCol"
      class="xbom-body-font"
    >
      <a-form-model-item label="权限名称" prop="name" class="xbom-form-item-tech">
        <a-input v-model="model.name" placeholder="请输入权限名称" class="xbom-input-premium" />
      </a-form-model-item>
      <a-form-model-item label="权限标识" prop="permission" class="xbom-form-item-tech">
        <div class="perm-key-wrapper">
          <a-input v-model="model.permission" placeholder="例如 system:user:view" class="xbom-tech-font perm-key-input" />
          <a-icon type="key" class="perm-icon" />
        </div>
      </a-form-model-item>
      <a-form-model-item label="权限类型" prop="type" class="xbom-form-item-tech">
        <a-radio-group v-model="model.type" button-style="solid" class="type-radio-group">
          <a-radio-button :value="1">
            <a-icon type="menu" /> 菜单门户
          </a-radio-button>
          <a-radio-button :value="2">
            <a-icon type="thunderbolt" /> 功能操作
          </a-radio-button>
        </a-radio-group>
      </a-form-model-item>
      <a-form-model-item label="权限描述" prop="description" class="xbom-form-item-tech">
        <a-textarea v-model="model.description" placeholder="请输入对该权限的详细定义描述..." :rows="3" />
      </a-form-model-item>
    </a-form-model>
  </a-modal>
</template>

<script>
export default {
  name: 'PermissionModal',
  data () {
    return {
      title: '操作',
      visible: false,
      confirmLoading: false,
      model: {
        id: 0,
        name: '',
        permission: '',
        type: 1,
        description: ''
      },
      labelCol: { span: 4 },
      wrapperCol: { span: 18 },
      rules: {
        name: [{ required: true, message: '请输入权限名称', trigger: 'blur' }],
        permission: [{ required: true, message: '请输入权限标识', trigger: 'blur' }],
        type: [{ required: true, message: '请选择权限类型', trigger: 'change' }]
      }
    }
  },
  methods: {
    add () {
      this.edit({ id: 0, type: 1, name: '', permission: '', description: '' })
    },
    edit (record) {
      this.model = Object.assign({}, record)
      this.visible = true
      this.title = record.id > 0 ? '编辑权限项目' : '创建新权限'
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
.perm-key-wrapper {
  position: relative;
  .perm-key-input {
    padding-right: 32px;
    background: #f8fafc !important;
    font-weight: 500;
  }
  .perm-icon {
    position: absolute;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
    color: #94a3b8;
  }
}

.type-radio-group {
  :deep(.ant-radio-button-wrapper) {
    border-radius: 4px !important;
    margin-right: 8px;
    border: 1px solid #e2e8f0;
    &:not(:first-child)::before {
      display: none;
    }
    &-checked {
      border-color: #22c55e !important;
      color: #22c55e !important;
      background: rgba(34, 197, 94, 0.05) !important;
      box-shadow: none !important;
    }
  }
}
</style>
