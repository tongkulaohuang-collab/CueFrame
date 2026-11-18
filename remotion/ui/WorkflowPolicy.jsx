import React from 'react';
import { LockKeyhole } from 'lucide-react';
import { videoWorkflowPolicy as policy } from '../shared/workflow-policy.mjs';

export function WorkflowPolicy() {
  return (
    <details className="workflow-policy" data-policy={policy.id}>
      <summary>
        <LockKeyhole size={16} aria-hidden="true" />
        <strong>视频默认规则</strong>
        <span className="policy-state">始终执行</span>
        <span className="policy-description">{policy.title}</span>
        <span className="policy-disclosure">查看规则</span>
      </summary>
      <div className="policy-body">
        <p>{policy.scope}新建、重开、复制项目或导入素材，都不会关闭这条规则。</p>
        <ol>{policy.rules.map(rule => <li key={rule}>{rule}</li>)}</ol>
        <p className="policy-enforcement">{policy.enforcement}填写记录不能代替实际观看。</p>
      </div>
    </details>
  );
}
