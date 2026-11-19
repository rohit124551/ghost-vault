import { createElement, useState } from 'react';
import ConfirmAction from '../components/ConfirmAction';

export function useConfirmAction() {
  const [request, setRequest] = useState(null);
  const confirmAction = options => setRequest(current => current || options);
  const dialog = request ? createElement(ConfirmAction, {
    request,
    onClose: () => setRequest(null),
  }) : null;
  return [confirmAction, dialog];
}
