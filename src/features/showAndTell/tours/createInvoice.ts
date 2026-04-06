import dayjs from 'dayjs';
import type { Tour } from '../ShowAndTellContext';

/** Demo data used to pre-fill the Create Invoice form during the tour */
export const DEMO_INVOICE = {
  businessUnit:    'BCLD Financing Corp',
  supplier:        'ORACLE CORPORATION',
  supplierNumber:  'SUP-DEMO-001',
  invoiceNumber:   `DEMO-${dayjs().format('YYYYMMDD')}-001`,
  invoiceDate:     dayjs(),
  invoiceAmount:   5000,
  invoiceCurrency: 'AED',
  description:     'Professional Services — Show & Tell Demo',
};

export const createInvoiceTour: Tour = {
  id:          'create-invoice',
  title:       'Create Invoice',
  icon:        '🧾',
  description: 'Walk through creating a complete vendor invoice end-to-end.',
  steps: [
    {
      id:          'intro',
      note:        "Welcome to Show & Tell: Create Invoice! 🎬\n\nWe'll walk through creating a real vendor invoice together — from selecting a supplier to saving the final document. Click Next to begin.",
      noteColor:   'blue',
      noteRotation: -2,
    },
    {
      id:        'navigate',
      note:      "Navigating to Manage Invoices — your AP invoice hub. All invoices are created, tracked, and paid from here.",
      noteColor: 'yellow',
      autoNextMs: 2500,
      action:    async ({ navigate }) => {
        navigate('/ap/manage-invoices');
      },
    },
    {
      id:        'business-unit',
      note:      "Business Unit is set. This determines the legal entity and accounting structure the invoice will be booked against.",
      fillLabel: `Business Unit → ${DEMO_INVOICE.businessUnit}`,
      noteColor: 'yellow',
      targetId:  'invoice-business-unit',
      placement: 'bottom',
    },
    {
      id:        'supplier',
      note:      "Supplier selected. The supplier's default payment terms and site are applied automatically.",
      fillLabel: `Supplier → ${DEMO_INVOICE.supplier}`,
      noteColor: 'yellow',
      targetId:  'invoice-supplier',
      placement: 'bottom',
    },
    {
      id:        'invoice-number',
      note:      "Invoice number entered. Use the number from the supplier's physical document for easy cross-referencing during reconciliation.",
      fillLabel: `Invoice # → ${DEMO_INVOICE.invoiceNumber}`,
      noteColor: 'green',
      targetId:  'invoice-number',
      placement: 'bottom',
    },
    {
      id:        'invoice-date',
      note:      "Invoice date set. This is the date on the supplier's document — not the date you received it. It drives payment due dates.",
      fillLabel: `Invoice Date → ${DEMO_INVOICE.invoiceDate.format('DD-MMM-YYYY')}`,
      noteColor: 'green',
      targetId:  'invoice-date',
      placement: 'bottom',
    },
    {
      id:        'invoice-amount',
      note:      "Invoice amount entered. This must equal the sum of all line items below. Any mismatch will be caught during validation.",
      fillLabel: `Amount → AED ${DEMO_INVOICE.invoiceAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
      noteColor: 'green',
      targetId:  'invoice-amount',
      placement: 'bottom',
    },
    {
      id:        'invoice-lines',
      note:      "Invoice lines break down what was purchased. Each line has a description, amount, and GL account distribution. The total of all lines must match the invoice header amount.",
      noteColor: 'pink',
      targetId:  'invoice-lines-table',
      placement: 'top',
    },
    {
      id:        'save',
      note:      "Everything looks good! Click Save to record this invoice. It will be stored as 'Unpaid' status — ready for payment processing.",
      noteColor: 'blue',
      targetId:  'invoice-save-button',
      placement: 'bottom',
      noteRotation: 1.5,
    },
    {
      id:          'complete',
      note:        "🎉 Invoice created!\n\nThe invoice is now in the system as Unpaid. Next steps:\n• Pay in Full — from Invoice Actions menu\n• Create Payment — from Manage Payments\n• Approve — via Initiate Approval",
      noteColor:   'green',
      noteRotation: -1,
    },
  ],
};
