<template>
  <a-modal
    :title="title"
    :width="850"
    :visible="visible"
    :confirmLoading="confirmLoading"
    @ok="handleSubmit"
    @cancel="handleCancel"
    class="xbom-industrial-modal"
    :bodyStyle="{ padding: '16px 24px' }"
    destroyOnClose
    forceRender
  >
    <a-form-model
      ref="form"
      :model="model"
      :rules="rules"
      class="xbom-compact-form industrial-grid-form"
    >
      <div class="form-section-header">人员基础档案 (Employee Master Record)</div>

      <!-- Row 1: ID & Name -->
      <a-row :gutter="0" class="industrial-form-row">
        <a-col :span="12">
          <a-form-model-item label="工号" prop="id" :labelCol="{span: 6}" :wrapperCol="{span: 18}">
            <a-input v-model="model.id" placeholder="AUTO-ID" disabled class="xbom-tech-font" />
          </a-form-model-item>
        </a-col>
        <a-col :span="12">
          <a-form-model-item label="姓名" prop="username" :labelCol="{span: 6}" :wrapperCol="{span: 18}">
            <a-input v-model="model.username" placeholder="输入真实姓名" />
          </a-form-model-item>
        </a-col>
      </a-row>

      <!-- Row 2: Email & Role -->
      <a-row :gutter="0" class="industrial-form-row">
        <a-col :span="12">
          <a-form-model-item label="邮件" prop="email" :labelCol="{span: 6}" :wrapperCol="{span: 18}">
            <a-input v-model="model.email" placeholder="mail@company.com" />
          </a-form-model-item>
        </a-col>
        <a-col :span="12">
          <a-form-model-item label="角色" prop="roleName" :labelCol="{span: 6}" :wrapperCol="{span: 18}">
            <a-select v-model="model.roleName" placeholder="分配系统权限">
              <a-select-option value="管理员">管理员 (Admin)</a-select-option>
              <a-select-option value="开发者">开发者 (Dev)</a-select-option>
              <a-select-option value="测试">测试 (QA)</a-select-option>
            </a-select>
          </a-form-model-item>
        </a-col>
      </a-row>

      <!-- Row 3: Status & placeholder -->
      <a-row :gutter="0" class="industrial-form-row">
        <a-col :span="12">
          <a-form-model-item label="在职状态" prop="status" :labelCol="{span: 6}" :wrapperCol="{span: 18}">
            <a-radio-group v-model="model.status" button-style="solid" size="small">
              <a-radio-button :value="1">在职</a-radio-button>
              <a-radio-button :value="2">离职</a-radio-button>
            </a-radio-group>
          </a-form-model-item>
        </a-col>
        <a-col :span="12">
          <div class="industrial-placeholder-cell"></div>
        </a-col>
      </a-row>

      <div class="form-section-header" style="margin-top: 16px;">备注事项 (Operations Notes)</div>

      <!-- Row 4: Remarks -->
      <a-row :gutter="0" class="industrial-form-row last-row">
        <a-col :span="24">
          <a-form-model-item label="备注详情" :labelCol="{span: 3}" :wrapperCol="{span: 21}">
            <a-textarea v-model="model.remark" placeholder="输入相关业务备注..." :rows="3" />
          </a-form-model-item>
        </a-col>
      </a-row>
    </a-form-model>

    <template slot="footer">
      <div class="industrial-footer-panel">
        <a-button @click="handleCancel" size="small">取消 (Cancel)</a-button>
        <a-button type="primary" :loading="confirmLoading" @click="handleSubmit" size="small" class="btn-industrial-primary">
          执行入库 (Execute)
        </a-button>
      </div>
    </template>
  </a-modal>
</template>

<script>
export default {
  name: 'UserModal',
  data () {
    return {
      title: '操作',
      visible: false,
      confirmLoading: false,
      model: {
        id: undefined,
        username: '',
        email: '',
        roleName: undefined,
        status: 1,
        remark: ''
      },
      rules: {
        username: [{ required: true, message: '姓名不能为空', trigger: 'blur' }],
        email: [
          { required: true, message: '邮件不能为空', trigger: 'blur' },
          { type: 'email', message: '非法邮件格式', trigger: 'blur' }
        ],
        roleName: [{ required: true, message: '请分配角色', trigger: 'change' }]
      }
    }
  },
  methods: {
    add () {
      this.edit({ id: undefined, status: 1 })
    },
    edit (record) {
      this.model = Object.assign({ status: 1 }, record)
      this.visible = true
      this.title = record.id ? '编辑人员档案 (Edit Record)' : '新增人员入职 (New Entry)'
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
.xbom-industrial-modal {
  :deep(.ant-modal-header) {
    padding: 10px 24px;
    background: #003a8c;
    border-bottom: none;
    .ant-modal-title {
      font-size: 14px;
      color: #fff;
      font-weight: 600;
    }
  }

  :deep(.ant-modal-close-x) {
    color: #fff;
    line-height: 44px;
  }
}

.form-section-header {
  font-size: 11px;
  font-weight: 700;
  color: #003a8c;
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.industrial-grid-form {
  border: 1px solid #d9d9d9;

  .industrial-form-row {
    border-bottom: 1px solid #d9d9d9;
    display: flex;
    align-items: stretch;

    &.last-row {
      border-bottom: none;
    }

    :deep(.ant-form-item) {
      margin-bottom: 0;
      display: flex;
      width: 100%;
      align-items: center;

      .ant-form-item-label {
        background: #f5f5f5;
        border-right: 1px solid #d9d9d9;
        text-align: right;
        padding-right: 12px;
        flex-shrink: 0;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: flex-end;
        label {
          font-size: 12px;
          color: #262626;
          font-weight: 600;
          height: 100%;
          line-height: normal;
          display: flex;
          align-items: center;
        }
      }

      .ant-form-item-control-wrapper {
        padding: 4px 8px;
        flex: 1;
        .ant-form-item-control {
          line-height: normal;
        }
      }
    }
  }
}

.industrial-placeholder-cell {
  background: #fafafa;
  height: 100%;
  border-left: 1px solid #d9d9d9;
}

.industrial-footer-panel {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.btn-industrial-primary {
  background: #003a8c;
  border-color: #003a8c;
  border-radius: 2px;
}

.xbom-tech-font {
  font-family: 'Fira Code', monospace;
  font-weight: 600;
  color: #003a8c;
}

:deep(.ant-input), :deep(.ant-select-selection), :deep(.ant-input-number) {
  border-radius: 2px;
  font-size: 13px;
}
</style>
  }
}

:deep(.ant-modal-footer) {
  padding: 10px 16px;
  background: #fafafa;
  border-top: 1px solid #f0f0f0;
}

.xbom-tech-font {
  font-family: 'Fira Code', monospace;
  background-color: #f9f9f9;
}
</style>
