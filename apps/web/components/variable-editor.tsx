'use client';
import { useState } from 'react';
import { parseEnvironment, type EnvironmentVariable } from '@deploygrid/shared';
import { Button } from './ui/button';
export function VariableEditor({
  variables,
  onChange,
}: {
  variables: EnvironmentVariable[];
  onChange: (variables: EnvironmentVariable[]) => void;
}) {
  const [paste, setPaste] = useState('');
  const [error, setError] = useState('');
  return (
    <fieldset className="variable-editor">
      <legend>Environment variables</legend>
      <p className="help">
        Encrypted before saving. Available at runtime, including the first deployment. Docker build
        secrets require separate configuration.
      </p>
      {variables.map((variable, index) => (
        <div className="environment-inputs" key={index}>
          <label>
            Variable key {index + 1}
            <input
              required
              autoComplete="off"
              value={variable.name}
              onChange={(e) =>
                onChange(
                  variables.map((v, i) => (i === index ? { ...v, name: e.target.value } : v)),
                )
              }
            />
          </label>
          <label>
            Variable value {index + 1}
            <input
              type="password"
              autoComplete="new-password"
              value={variable.value}
              onChange={(e) =>
                onChange(
                  variables.map((v, i) => (i === index ? { ...v, value: e.target.value } : v)),
                )
              }
            />
          </label>
          <Button
            type="button"
            onClick={() => onChange(variables.filter((_, i) => i !== index))}
            aria-label={`Remove variable ${index + 1}`}
          >
            Remove
          </Button>
        </div>
      ))}
      <Button type="button" onClick={() => onChange([...variables, { name: '', value: '' }])}>
        Add environment variable
      </Button>
      <details>
        <summary>Add from .env</summary>
        <label>
          Paste .env contents
          <textarea
            autoComplete="off"
            spellCheck={false}
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
          />
        </label>
        <Button
          type="button"
          onClick={() => {
            try {
              const merged = new Map(variables.map((v) => [v.name, v]));
              for (const v of parseEnvironment(paste)) merged.set(v.name, v);
              onChange([...merged.values()]);
              setPaste('');
              setError('');
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Invalid .env');
            }
          }}
        >
          Import variables
        </Button>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </details>
    </fieldset>
  );
}
