'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Plus, Trash2, Eye, EyeOff, Pencil, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api';
import { Button } from './ui/button';
import { ErrorBox, date, Loading } from './common';
interface Variable {
  name: string;
  updatedAt: string;
}
export function EnvironmentPanel({ id, busy }: { id: string; busy: boolean }) {
  const client = useQueryClient();
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [visible, setVisible] = useState(false);
  const [saved, setSaved] = useState(false);
  const q = useQuery({
    queryKey: ['environment', id],
    queryFn: () => api<Variable[]>(`/projects/${id}/environment`),
  });
  const save = useMutation({
    mutationFn: () => api(`/projects/${id}/environment`, 'PUT', { name, value }),
    onSuccess: () => {
      setName('');
      setValue('');
      setSaved(true);
      void client.invalidateQueries({ queryKey: ['environment', id] });
    },
  });
  const remove = useMutation({
    mutationFn: (key: string) =>
      api(`/projects/${id}/environment/${encodeURIComponent(key)}`, 'DELETE'),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['environment', id] });
    },
  });
  return (
    <>
      <div className="section-heading">
        <div>
          <h2>Environment variables</h2>
          <p>Configure your application without committing values to Git.</p>
        </div>
        <KeyRound size={20} />
      </div>
      <div className="callout">
        <ShieldCheck size={18} />
        <div>
          <strong>Encrypted at rest. Never returned by the API.</strong>
          <p>
            Each deployment keeps its own configuration snapshot. Save changes, then deploy to apply
            them. Rollback restores the selected release’s variables.
          </p>
        </div>
      </div>
      <ErrorBox error={q.error || save.error || remove.error} />
      {saved && (
        <div className="notice success" role="status">
          Variable saved. Deploy this service to apply the updated configuration.
        </div>
      )}
      <div className="panel variable-list">
        {q.isPending ? (
          <Loading />
        ) : !q.data?.length ? (
          <div className="quiet-empty">
            <KeyRound size={20} />
            No variables configured. Add your first key below.
          </div>
        ) : (
          q.data.map((v) => (
            <div className="variable-row" key={v.name}>
              <div>
                <code>{v.name}</code>
                <small>Updated {date(v.updatedAt)}</small>
              </div>
              <code className="masked-value">••••••••••••••••</code>
              <button
                className="icon-button"
                aria-label={`Replace ${v.name}`}
                disabled={busy}
                onClick={() => {
                  setName(v.name);
                  setValue('');
                  setSaved(false);
                }}
              >
                <Pencil size={15} />
              </button>
              <button
                className="icon-button"
                aria-label={`Delete ${v.name}`}
                disabled={busy || remove.isPending}
                onClick={() => {
                  if (window.confirm(`Delete ${v.name}? Future deployments will omit it.`))
                    remove.mutate(v.name);
                }}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))
        )}
      </div>
      <form
        className="panel environment-form"
        onSubmit={(e) => {
          e.preventDefault();
          setSaved(false);
          save.mutate();
        }}
      >
        <h2>
          {q.data?.some((v) => v.name === name) ? 'Replace variable' : 'Add environment variable'}
        </h2>
        <div className="environment-inputs">
          <label>
            Key
            <input
              required
              pattern="[A-Za-z_][A-Za-z0-9_]*"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="DATABASE_URL"
              autoComplete="off"
            />
          </label>
          <label>
            Value
            <div className="password-field">
              <input
                required
                type={visible ? 'text' : 'password'}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Enter a value"
                autoComplete="new-password"
              />
              <button
                type="button"
                aria-label={visible ? 'Hide entered value' : 'Show entered value'}
                onClick={() => setVisible(!visible)}
              >
                {visible ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </label>
          <Button variant="default" disabled={busy || save.isPending}>
            <Plus size={15} />
            {save.isPending ? 'Saving…' : 'Save variable'}
          </Button>
        </div>
        <p className="help">
          Existing values cannot be revealed. Enter a replacement to update a key.
        </p>
      </form>
    </>
  );
}
