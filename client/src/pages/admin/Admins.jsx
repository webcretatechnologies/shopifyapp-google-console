import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import {
  Page, Card, IndexTable, Text, Badge, Button, Modal, FormLayout,
  TextField, Select, InlineStack, Box, BlockStack, Spinner,
} from '@shopify/polaris';
import { adminApi } from '../../api';

const ROLE_TONES = { super_admin: 'attention', admin: 'info', support: 'success' };
const EMPTY_FORM = { name: '', email: '', password: '', role: 'admin' };

export default function AdminAdmins() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const { data: admins, isLoading } = useQuery('admin-admins', adminApi.admins);

  const createMutation = useMutation(() => adminApi.createAdmin(form), {
    onSuccess: () => {
      queryClient.invalidateQueries('admin-admins');
      setModalOpen(false);
      setForm(EMPTY_FORM);
    },
  });

  const toggleMutation = useMutation(
    ({ id, is_active }) => adminApi.updateAdmin(id, { is_active }),
    { onSuccess: () => queryClient.invalidateQueries('admin-admins') }
  );

  const set = (key) => (val) => setForm(f => ({ ...f, [key]: val }));

  return (
    <Page
      title="Admin Users"
      primaryAction={{ content: '+ Add Admin', onAction: () => setModalOpen(true) }}
    >
      <Card padding="0">
        {isLoading ? (
          <Box padding="800"><InlineStack align="center"><Spinner /></InlineStack></Box>
        ) : (
          <IndexTable
            resourceName={{ singular: 'admin', plural: 'admins' }}
            itemCount={(admins || []).length}
            headings={[
              { title: 'Name' },
              { title: 'Email' },
              { title: 'Role' },
              { title: 'Status' },
              { title: 'Last Login' },
              { title: 'Actions' },
            ]}
            selectable={false}
          >
            {(admins || []).map((admin, index) => (
              <IndexTable.Row id={String(admin.id)} key={admin.id} position={index}>
                <IndexTable.Cell>
                  <Text variant="bodyMd" fontWeight="semibold">{admin.name}</Text>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <Text variant="bodySm" tone="subdued">{admin.email}</Text>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <Badge tone={ROLE_TONES[admin.role] || 'base'}>
                    {admin.role?.replace('_', ' ')}
                  </Badge>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <Badge tone={admin.is_active ? 'success' : 'critical'}>
                    {admin.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <Text variant="bodySm" tone="subdued">
                    {admin.last_login_at
                      ? new Date(admin.last_login_at).toLocaleString()
                      : 'Never'}
                  </Text>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  {admin.role !== 'super_admin' && (
                    <Button
                      size="slim"
                      tone={admin.is_active ? 'critical' : undefined}
                      onClick={() => toggleMutation.mutate({ id: admin.id, is_active: !admin.is_active })}
                      loading={toggleMutation.isLoading}
                    >
                      {admin.is_active ? 'Disable' : 'Enable'}
                    </Button>
                  )}
                </IndexTable.Cell>
              </IndexTable.Row>
            ))}
          </IndexTable>
        )}
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Add Admin User"
        primaryAction={{
          content: createMutation.isLoading ? 'Creating...' : 'Create Admin',
          onAction: () => createMutation.mutate(),
          loading: createMutation.isLoading,
        }}
        secondaryActions={[{ content: 'Cancel', onAction: () => setModalOpen(false) }]}
      >
        <Modal.Section>
          <FormLayout>
            <TextField label="Full Name" value={form.name} onChange={set('name')} autoComplete="off" />
            <TextField label="Email Address" type="email" value={form.email} onChange={set('email')} autoComplete="off" />
            <TextField label="Password" type="password" value={form.password} onChange={set('password')} autoComplete="new-password" helpText="Minimum 8 characters recommended" />
            <Select
              label="Role"
              value={form.role}
              onChange={set('role')}
              options={[
                { label: 'Admin', value: 'admin' },
                { label: 'Support', value: 'support' },
                { label: 'Super Admin', value: 'super_admin' },
              ]}
            />
          </FormLayout>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
